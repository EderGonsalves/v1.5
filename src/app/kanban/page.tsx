"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw, Settings2 } from "lucide-react";
import {
  getKanbanColumns,
  getCaseKanbanStatus,
  getBaserowCases,
  initializeDefaultKanbanColumns,
  createKanbanColumn,
  updateKanbanColumn,
  deleteKanbanColumn,
  createCaseKanbanStatus,
  updateCaseKanbanStatus,
  type KanbanColumnRow,
  type CaseKanbanStatusRow,
  type BaserowCaseRow,
} from "@/services/api";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanCardDetail } from "@/components/kanban/KanbanCardDetail";
import { ColumnEditorModal } from "@/components/kanban/ColumnEditorModal";
import { getCaseStage } from "@/lib/case-stats";

type CaseWithStatus = BaserowCaseRow & {
  kanbanColumnId: number | null;
};

type PendingKanbanUpdate = {
  id: string;
  caseId: number;
  institutionId: number;
  columnId: number;
  statusId: number | null;
  tempStatusId: number | null;
  createdAt: string;
};

const PENDING_UPDATES_KEY = "kanban_pending_updates";

const loadPendingUpdates = (): PendingKanbanUpdate[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PENDING_UPDATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const persistPendingUpdates = (updates: PendingKanbanUpdate[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_UPDATES_KEY, JSON.stringify(updates));
  } catch {
    // ignore storage errors
  }
};

const generateUpdateId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
};

export default function KanbanPage() {
  const { data, isHydrated } = useOnboarding();
  const router = useRouter();
  const normalizedInstitutionId = useMemo(() => {
    const value = data.auth?.institutionId;
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data.auth?.institutionId]);

  const [columns, setColumns] = useState<KanbanColumnRow[]>([]);
  const [caseStatuses, setCaseStatuses] = useState<CaseKanbanStatusRow[]>([]);
  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCase, setActiveCase] = useState<CaseWithStatus | null>(null);
  const [selectedCase, setSelectedCase] = useState<BaserowCaseRow | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isColumnEditorOpen, setIsColumnEditorOpen] = useState(false);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<PendingKanbanUpdate[]>([]);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnRow | null>(null);
  const [isDraggingColumn, setIsDraggingColumn] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Custom collision detection that prioritizes the right targets
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const { active } = args;
    const activeId = String(active.id);

    // If dragging a column, only detect collisions with other columns (not drop zones)
    if (activeId.startsWith("column-") && !activeId.startsWith("column-drop-")) {
      const collisions = rectIntersection(args);
      // Filter to only include sortable column targets, not droppable zones
      return collisions.filter((collision) => {
        const id = String(collision.id);
        return id.startsWith("column-") && !id.startsWith("column-drop-");
      });
    }

    // If dragging a card, use pointerWithin for better precision
    return pointerWithin(args);
  }, []);

  useEffect(() => {
    setPendingUpdates(loadPendingUpdates());
  }, []);

  useEffect(() => {
    persistPendingUpdates(pendingUpdates);
  }, [pendingUpdates]);

  const processingUpdatesRef = useRef<Set<string>>(new Set());

  const processPendingUpdate = useCallback(
    async (update: PendingKanbanUpdate) => {
      if (processingUpdatesRef.current.has(update.id)) return;
      processingUpdatesRef.current.add(update.id);
      try {
        if (update.statusId) {
          const updatedStatus = await updateCaseKanbanStatus(update.statusId, {
            column_id: update.columnId,
            moved_by: "user",
          });
          setCaseStatuses((prev) =>
            prev.map((status) => (status.id === updatedStatus.id ? updatedStatus : status))
          );
        } else {
          const createdStatus = await createCaseKanbanStatus({
            case_id: update.caseId,
            institution_id: update.institutionId,
            column_id: update.columnId,
            moved_by: "user",
          });
          setCaseStatuses((prev) => {
            if (update.tempStatusId !== null) {
              const hasTemp = prev.some((status) => status.id === update.tempStatusId);
              if (hasTemp) {
                return prev.map((status) =>
                  status.id === update.tempStatusId ? createdStatus : status
                );
              }
            }
            const alreadyExists = prev.some(
              (status) => status.case_id === createdStatus.case_id
            );
            if (alreadyExists) {
              return prev.map((status) =>
                status.case_id === createdStatus.case_id ? createdStatus : status
              );
            }
            return [...prev, createdStatus];
          });
        }
        setPendingUpdates((prev) => prev.filter((item) => item.id !== update.id));
      } catch (err) {
        console.error("Falha ao sincronizar status do Kanban:", err);
      } finally {
        processingUpdatesRef.current.delete(update.id);
      }
    },
    []
  );

  useEffect(() => {
    if (!pendingUpdates.length) return;
    pendingUpdates.forEach((update) => {
      void processPendingUpdate(update);
    });
  }, [pendingUpdates, processPendingUpdate]);

  useEffect(() => {
    if (!pendingUpdates.length) return;
    if (typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      pendingUpdates.forEach((update) => {
        void processPendingUpdate(update);
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [pendingUpdates, processPendingUpdate]);

  const loadData = useCallback(async () => {
    if (!normalizedInstitutionId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Load columns (initialize defaults if none exist)
      let kanbanColumns = await getKanbanColumns(normalizedInstitutionId);
      if (kanbanColumns.length === 0) {
        kanbanColumns = await initializeDefaultKanbanColumns(normalizedInstitutionId);
      }
      setColumns(kanbanColumns);

      // Load case statuses
      try {
        const statuses = await getCaseKanbanStatus(undefined, normalizedInstitutionId);
        setCaseStatuses(statuses);
        setStatusLoadError(null);
      } catch (statusError) {
        const message =
          statusError instanceof Error
            ? statusError.message
            : "Nao foi possivel carregar status do Kanban";
        console.error("Falha ao buscar status do Kanban:", statusError);
        setStatusLoadError(message);
      }

      // Load cases
      const casesResponse = await getBaserowCases({
        institutionId: normalizedInstitutionId,
        fetchAll: true,
      });
      setCases(casesResponse.results);
    } catch (err) {
      console.error("Erro ao carregar dados do Kanban:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  }, [normalizedInstitutionId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    if (normalizedInstitutionId === null) return;
    loadData();
  }, [isHydrated, data.auth, normalizedInstitutionId, loadData, router]);

  // Map cases to their columns
  const casesWithStatus = useMemo((): CaseWithStatus[] => {
    const statusMap = new Map<number, number>();
    caseStatuses.forEach((status) => {
      // Ensure we convert to numbers since API may return strings
      const caseIdNum = Number(status.case_id);
      const columnIdNum = Number(status.column_id);
      if (caseIdNum && columnIdNum) {
        statusMap.set(caseIdNum, columnIdNum);
      }
    });

    return cases.map((caseRow) => {
      const manualColumnId = statusMap.get(Number(caseRow.id));

      // If there's a manual column assignment, use it
      if (manualColumnId) {
        return { ...caseRow, kanbanColumnId: manualColumnId };
      }

      // Otherwise, auto-assign based on case stage
      const stage = getCaseStage(caseRow);
      const autoColumn = columns.find((col) => {
        if (!col.auto_rule) return false;
        try {
          const rule = JSON.parse(col.auto_rule);
          return rule.stages?.includes(stage);
        } catch {
          return false;
        }
      });

      return {
        ...caseRow,
        kanbanColumnId: autoColumn?.id || columns[0]?.id || null,
      };
    });
  }, [cases, caseStatuses, columns]);

  // Filter cases by search
  const searchedCases = useMemo(() => {
    if (!searchQuery.trim()) return casesWithStatus;
    const query = searchQuery.toLowerCase();
    return casesWithStatus.filter((caseRow) => {
      const name = (caseRow.CustumerName || "").toLowerCase();
      const phone = (caseRow.CustumerPhone || "").replace(/\D/g, "");
      const id = String(caseRow.id);
      const bjId = String(caseRow.BJCaseId || "");
      return (
        name.includes(query) ||
        phone.includes(query.replace(/\D/g, "")) ||
        id.includes(query) ||
        bjId.includes(query)
      );
    });
  }, [casesWithStatus, searchQuery]);

  // Group cases by column
  const casesByColumn = useMemo(() => {
    const grouped = new Map<number, CaseWithStatus[]>();
    columns.forEach((col) => grouped.set(Number(col.id), []));

    searchedCases.forEach((caseRow) => {
      const colId = Number(caseRow.kanbanColumnId);
      if (colId && grouped.has(colId)) {
        grouped.get(colId)!.push(caseRow);
      }
    });

    return grouped;
  }, [searchedCases, columns]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = String(active.id);

    // Check if dragging a column
    if (activeId.startsWith("column-")) {
      const columnId = Number(activeId.replace("column-", ""));
      const draggedColumn = columns.find((c) => Number(c.id) === columnId);
      setActiveColumn(draggedColumn || null);
      setIsDraggingColumn(true);
      setActiveCase(null);
    } else {
      // Dragging a card
      const caseId = Number(active.id);
      const draggedCase = casesWithStatus.find((c) => Number(c.id) === caseId);
      setActiveCase(draggedCase || null);
      setActiveColumn(null);
      setIsDraggingColumn(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    // Reset drag states
    setActiveCase(null);
    setActiveColumn(null);
    setIsDraggingColumn(false);

    if (!over || !normalizedInstitutionId) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle column reordering
    if (activeId.startsWith("column-") && !activeId.startsWith("column-drop-")) {
      // Extract the target column ID from various possible formats
      let overColumnId: number | null = null;

      if (overId.startsWith("column-drop-")) {
        overColumnId = Number(overId.replace("column-drop-", ""));
      } else if (overId.startsWith("column-")) {
        overColumnId = Number(overId.replace("column-", ""));
      }

      if (overColumnId === null) return;

      const activeColumnId = Number(activeId.replace("column-", ""));

      if (activeColumnId !== overColumnId) {
        const oldIndex = columns.findIndex((c) => Number(c.id) === activeColumnId);
        const newIndex = columns.findIndex((c) => Number(c.id) === overColumnId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newColumns = arrayMove(columns, oldIndex, newIndex);

          // Update local state immediately
          setColumns(newColumns);

          // Update order in database
          newColumns.forEach(async (col, index) => {
            try {
              await updateKanbanColumn(Number(col.id), { ordem: index + 1 });
            } catch (err) {
              console.error("Erro ao atualizar ordem da coluna:", err);
            }
          });
        }
      }
      return;
    }

    // Handle card movement
    const caseId = Number(active.id);

    // Extract column ID from droppable ID
    let targetColumnId: number | null = null;

    if (overId.startsWith("column-drop-")) {
      targetColumnId = Number(overId.replace("column-drop-", ""));
    } else {
      // Dropped on a card - find the column of that card
      const targetCase = casesWithStatus.find((c) => Number(c.id) === Number(overId));
      if (targetCase && targetCase.kanbanColumnId) {
        targetColumnId = Number(targetCase.kanbanColumnId);
      }
    }

    if (!targetColumnId) return;

    // Find the case and check if it's already in this column
    const movedCase = casesWithStatus.find((c) => Number(c.id) === caseId);
    if (!movedCase || Number(movedCase.kanbanColumnId) === targetColumnId) return;

    const existingStatus = caseStatuses.find(
      (status) =>
        Number(status.case_id) === caseId &&
        Number(status.institution_id) === normalizedInstitutionId
    );

    if (existingStatus) {
      setCaseStatuses((prev) =>
        prev.map((status) =>
          status.id === existingStatus.id
            ? { ...status, column_id: targetColumnId, moved_at: new Date().toISOString() }
            : status
        )
      );
    } else {
      const tempStatusId = -Date.now();
      setCaseStatuses((prev) => [
        ...prev,
        {
          id: tempStatusId,
          case_id: caseId,
          institution_id: normalizedInstitutionId,
          column_id: targetColumnId,
          moved_at: new Date().toISOString(),
          moved_by: "user",
        },
      ]);

      setPendingUpdates((prev) => [
        ...prev,
        {
          id: generateUpdateId(),
          caseId,
          institutionId: normalizedInstitutionId,
          columnId: targetColumnId,
          statusId: null,
          tempStatusId,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    setPendingUpdates((prev) => [
      ...prev,
      {
        id: generateUpdateId(),
        caseId,
        institutionId: normalizedInstitutionId,
        columnId: targetColumnId,
        statusId: existingStatus?.id ?? null,
        tempStatusId: null,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handleCardClick = (caseRow: BaserowCaseRow) => {
    setSelectedCase(caseRow);
    setIsDetailOpen(true);
  };

  const handleColumnNameUpdate = async (columnId: number, newName: string) => {
    try {
      // Update local state immediately
      setColumns((prev) =>
        prev.map((col) =>
          Number(col.id) === columnId ? { ...col, name: newName } : col
        )
      );

      // Update in database
      await updateKanbanColumn(columnId, { name: newName });
    } catch (err) {
      console.error("Erro ao atualizar nome da coluna:", err);
      // Revert on error
      loadData();
    }
  };

  const handleSaveColumns = async (updatedColumns: KanbanColumnRow[]) => {
    if (!normalizedInstitutionId) return;

    try {
      // Process column changes
      const existingIds = columns.map((c) => c.id);
      const updatedIds = updatedColumns.filter((c) => c.id > 0).map((c) => c.id);

      // Delete removed columns
      for (const col of columns) {
        if (!updatedIds.includes(col.id)) {
          await deleteKanbanColumn(col.id);
        }
      }

      // Update or create columns
      const newColumns: KanbanColumnRow[] = [];
      for (const col of updatedColumns) {
        if (col.id > 0 && existingIds.includes(col.id)) {
          // Update existing
          const updated = await updateKanbanColumn(col.id, {
            name: col.name,
            ordem: col.ordem,
            color: col.color,
            auto_rule: col.auto_rule ?? null,
          });
          newColumns.push(updated);
        } else {
          // Create new
          const created = await createKanbanColumn({
            institution_id: normalizedInstitutionId,
            name: col.name || "Nova Coluna",
            ordem: col.ordem || newColumns.length + 1,
            color: col.color || "gray",
            auto_rule: col.auto_rule ?? null,
          });
          newColumns.push(created);
        }
      }

      newColumns.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
      setColumns(newColumns);
    } catch (err) {
      console.error("Erro ao salvar colunas:", err);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando Kanban..." />;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Erro</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadData}>Tentar Novamente</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {statusLoadError ? (
          <div className="bg-amber-50 text-amber-900 text-sm px-4 py-2 border-b border-amber-200">
            {statusLoadError}. Utilize o botão “Atualizar” para tentar novamente.
          </div>
        ) : null}
        {/* Header */}
        <div className="border-b border-border/40 bg-background/95 px-4 py-4">
          <div className="mx-auto max-w-[1800px] flex items-center justify-between gap-4 flex-wrap">
            <div></div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <Input
                type="search"
                placeholder="Buscar por nome, telefone ou ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsColumnEditorOpen(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Editar Colunas
              </Button>
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columns.map((c) => `column-${Number(c.id)}`)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-4 h-full min-w-max">
                {columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cases={casesByColumn.get(Number(column.id)) || []}
                    onCardClick={handleCardClick}
                    onColumnUpdate={handleColumnNameUpdate}
                    isDraggingColumn={isDraggingColumn}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeCase ? (
                <KanbanCard caseData={activeCase} isDragging />
              ) : activeColumn ? (
                <div className="w-80 min-w-[320px] rounded-lg border border-t-4 border-t-primary bg-background/95 p-3 shadow-2xl">
                  <span className="font-semibold text-sm">{activeColumn.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Detail Modal */}
      <KanbanCardDetail
        caseData={selectedCase}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />

      {/* Column Editor Modal */}
      <ColumnEditorModal
        columns={columns}
        open={isColumnEditorOpen}
        onOpenChange={setIsColumnEditorOpen}
        onSave={handleSaveColumns}
      />
    </main>
  );

}

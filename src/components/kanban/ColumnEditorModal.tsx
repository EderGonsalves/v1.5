"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Plus,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Palette,
  Zap,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanColumnRow } from "@/services/api";
import { CaseStage, stageLabels, stageOrder } from "@/lib/case-stats";

const colorOptions = [
  { value: "blue", label: "Azul", bg: "bg-blue-500", border: "border-blue-500", light: "bg-blue-50" },
  { value: "amber", label: "Amarelo", bg: "bg-amber-500", border: "border-amber-500", light: "bg-amber-50" },
  { value: "purple", label: "Roxo", bg: "bg-purple-500", border: "border-purple-500", light: "bg-purple-50" },
  { value: "green", label: "Verde", bg: "bg-green-500", border: "border-green-500", light: "bg-green-50" },
  { value: "red", label: "Vermelho", bg: "bg-red-500", border: "border-red-500", light: "bg-red-50" },
  { value: "gray", label: "Cinza", bg: "bg-gray-500", border: "border-gray-500", light: "bg-gray-50" },
  { value: "pink", label: "Rosa", bg: "bg-pink-500", border: "border-pink-500", light: "bg-pink-50" },
  { value: "indigo", label: "Indigo", bg: "bg-indigo-500", border: "border-indigo-500", light: "bg-indigo-50" },
  { value: "cyan", label: "Ciano", bg: "bg-cyan-500", border: "border-cyan-500", light: "bg-cyan-50" },
  { value: "orange", label: "Laranja", bg: "bg-orange-500", border: "border-orange-500", light: "bg-orange-50" },
];

const parseAutoRule = (value?: string | null): CaseStage[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const stages = (parsed as { stages?: unknown[] }).stages;
    if (!Array.isArray(stages)) {
      return [];
    }

    return stages.filter((stage): stage is CaseStage =>
      stageOrder.includes(stage as CaseStage)
    );
  } catch {
    return [];
  }
};

type EditableColumn = {
  id: number;
  name: string;
  ordem: number;
  color: string;
  autoRuleStages: CaseStage[];
  isNew?: boolean;
  isExpanded?: boolean;
};

type ColumnEditorModalProps = {
  columns: KanbanColumnRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (columns: KanbanColumnRow[]) => Promise<void>;
  departmentName?: string | null;
};

export function ColumnEditorModal({
  columns,
  open,
  onOpenChange,
  onSave,
  departmentName,
}: ColumnEditorModalProps) {
  const [editableColumns, setEditableColumns] = useState<EditableColumn[]>(() =>
    columns.map((col, idx) => ({
      id: col.id,
      name: col.name || "",
      ordem: col.ordem ?? idx + 1,
      color: col.color || "gray",
      autoRuleStages: parseAutoRule(col.auto_rule),
      isExpanded: false,
    }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Reset state when modal opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setEditableColumns(
        columns.map((col, idx) => ({
          id: col.id,
          name: col.name || "",
          ordem: col.ordem ?? idx + 1,
          color: col.color || "gray",
          autoRuleStages: parseAutoRule(col.auto_rule),
          isExpanded: false,
        }))
      );
      setDeleteConfirm(null);
    }
    onOpenChange(isOpen);
  };

  const handleAddColumn = () => {
    const newOrder = editableColumns.length + 1;
    setEditableColumns([
      ...editableColumns,
      {
        id: -Date.now(),
        name: "",
        ordem: newOrder,
        color: "gray",
        autoRuleStages: [],
        isNew: true,
        isExpanded: true,
      },
    ]);
  };

  const handleRemoveColumn = (id: number) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setEditableColumns((prev) => {
      const filtered = prev.filter((col) => col.id !== id);
      return filtered.map((col, idx) => ({ ...col, ordem: idx + 1 }));
    });
    setDeleteConfirm(null);
  };

  const handleUpdateColumn = (
    id: number,
    field: keyof EditableColumn,
    value: string | number | boolean
  ) => {
    setEditableColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, [field]: value } : col))
    );
  };

  const handleMoveColumn = (id: number, direction: "up" | "down") => {
    setEditableColumns((prev) => {
      const idx = prev.findIndex((col) => col.id === id);
      if (idx === -1) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;

      const newCols = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [newCols[idx], newCols[swapIdx]] = [newCols[swapIdx], newCols[idx]];

      return newCols.map((col, i) => ({ ...col, ordem: i + 1 }));
    });
  };

  const handleToggleStage = (id: number, stage: CaseStage) => {
    setEditableColumns((prev) =>
      prev.map((col) => {
        if (col.id !== id) return col;
        const hasStage = col.autoRuleStages.includes(stage);
        const nextStages = hasStage
          ? col.autoRuleStages.filter((s) => s !== stage)
          : [...col.autoRuleStages, stage];
        const orderedStages = stageOrder.filter((stageItem) =>
          nextStages.includes(stageItem)
        );
        return { ...col, autoRuleStages: orderedStages };
      })
    );
  };

  const toggleExpanded = (id: number) => {
    setEditableColumns((prev) =>
      prev.map((col) =>
        col.id === id ? { ...col, isExpanded: !col.isExpanded } : col
      )
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const columnsToSave = editableColumns.map((col) => ({
        id: col.isNew ? 0 : col.id,
        name: col.name || "Nova Coluna",
        ordem: col.ordem,
        color: col.color,
        auto_rule: col.autoRuleStages.length
          ? JSON.stringify({ stages: col.autoRuleStages })
          : null,
      })) as KanbanColumnRow[];

      await onSave(columnsToSave);
      onOpenChange(false);
    } catch (err) {
      console.error("Erro ao salvar colunas:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const getColorOption = (colorValue: string) =>
    colorOptions.find((c) => c.value === colorValue) || colorOptions[5];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-hidden flex flex-col p-0"
        style={{ maxWidth: "700px", width: "95vw" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Configurar Colunas
          </DialogTitle>
          <DialogDescription>
            {departmentName
              ? `Colunas do departamento: ${departmentName}`
              : "Colunas padrão da instituição"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {editableColumns.map((col, idx) => {
              const colorOpt = getColorOption(col.color);
              const isDeleting = deleteConfirm === col.id;

              return (
                <div
                  key={col.id}
                  className={cn(
                    "rounded-xl border-2 transition-all overflow-hidden",
                    colorOpt.border,
                    col.isExpanded ? "shadow-md" : "shadow-sm"
                  )}
                >
                  {/* Header da coluna - sempre visível */}
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3",
                      colorOpt.light
                    )}
                  >
                    {/* Drag handle e ordem */}
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
                          colorOpt.bg
                        )}
                      >
                        {col.ordem}
                      </span>
                    </div>

                    {/* Preview da cor */}
                    <div
                      className={cn("w-1 h-8 rounded-full", colorOpt.bg)}
                    />

                    {/* Nome da coluna */}
                    <Input
                      value={col.name}
                      onChange={(e) =>
                        handleUpdateColumn(col.id, "name", e.target.value)
                      }
                      placeholder="Nome da coluna"
                      className="flex-1 h-9 font-medium border-0 bg-white/50 focus-visible:bg-white"
                    />

                    {/* Botões de ação */}
                    <div className="flex items-center gap-1">
                      {/* Move up/down */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(col.id, "up")}
                          disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-white/50 disabled:opacity-30 transition-colors"
                          title="Mover para cima"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(col.id, "down")}
                          disabled={idx === editableColumns.length - 1}
                          className="p-0.5 rounded hover:bg-white/50 disabled:opacity-30 transition-colors"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Expand/collapse */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(col.id)}
                        className="h-8 px-2"
                      >
                        {col.isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>

                      {/* Delete */}
                      <Button
                        type="button"
                        variant={isDeleting ? "destructive" : "ghost"}
                        size="sm"
                        onClick={() => handleRemoveColumn(col.id)}
                        onBlur={() => setDeleteConfirm(null)}
                        className={cn(
                          "h-8 px-2 transition-all",
                          isDeleting && "animate-pulse"
                        )}
                        title={isDeleting ? "Clique novamente para confirmar" : "Remover coluna"}
                      >
                        {isDeleting ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Conteúdo expandido */}
                  {col.isExpanded && (
                    <div className="p-4 bg-white dark:bg-zinc-900 space-y-4 border-t">
                      {/* Seletor de cores */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
                          <Palette className="h-3.5 w-3.5" />
                          Cor da Coluna
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {colorOptions.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                handleUpdateColumn(col.id, "color", opt.value)
                              }
                              className={cn(
                                "w-8 h-8 rounded-lg transition-all flex items-center justify-center",
                                opt.bg,
                                col.color === opt.value
                                  ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white scale-110"
                                  : "opacity-60 hover:opacity-100 hover:scale-105"
                              )}
                              title={opt.label}
                            >
                              {col.color === opt.value && (
                                <svg
                                  className="h-4 w-4 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Auto-rule stages */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" />
                          Etapas Auto-atribuídas
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Casos nestas etapas serão automaticamente movidos para esta coluna
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {stageOrder.map((stage) => {
                            const isActive = col.autoRuleStages.includes(stage);
                            return (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => handleToggleStage(col.id, stage)}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all",
                                  isActive
                                    ? cn(colorOpt.bg, "text-white border-transparent")
                                    : "border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                                )}
                              >
                                {stageLabels[stage]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botão adicionar */}
          <Button
            type="button"
            variant="outline"
            onClick={handleAddColumn}
            className="w-full mt-4 h-12 border-dashed border-2 hover:border-primary hover:bg-primary/5"
          >
            <Plus className="h-5 w-5 mr-2" />
            Adicionar Nova Coluna
          </Button>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-muted-foreground">
              {editableColumns.length} coluna{editableColumns.length !== 1 && "s"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="min-w-[140px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getBaserowCases,
  getBaserowConfigs,
  updateBaserowCase,
  type BaserowCaseRow,
  type BaserowConfigRow,
} from "@/services/api";
import { KanbanCardDetail } from "@/components/kanban/KanbanCardDetail";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { MessageSquareText, RefreshCw, List, Kanban, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { KanbanView } from "@/components/kanban/KanbanView";
import {
  CaseStage,
  computeCaseStatistics,
  getCaseInstitutionId,
  getCaseStage,
  isCasePaused,
  stageColors,
  stageLabels,
  stageOrder,
} from "@/lib/case-stats";
import { useStatistics } from "@/hooks/use-statistics";

// Cache de casos em sessionStorage
type CachedCases = {
  cases: BaserowCaseRow[];
  timestamp: number;
  institutionId: number;
  totalCount: number;
};

const CASES_CACHE_KEY = "onboarding_cases_cache";
const CASES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getCasesFromCache = (institutionId: number): CachedCases | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CASES_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCases;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CASES_CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setCasesCache = (institutionId: number, cases: BaserowCaseRow[], totalCount: number): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCases = {
      cases,
      timestamp: Date.now(),
      institutionId,
      totalCount,
    };
    sessionStorage.setItem(CASES_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

type InstitutionOption = {
  id: string;
  label: string;
};

const parseDateInput = (value: string, options?: { endOfDay?: boolean }) => {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (options?.endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

export default function CasosPage() {
  const { data, isHydrated } = useOnboarding();
  const router = useRouter();
  const normalizedInstitutionId = useMemo(() => {
    const value = data.auth?.institutionId;
    if (value === undefined || value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data.auth?.institutionId]);

  // Hook para estatísticas server-side
  const {
    stats: serverStats,
    isLoading: statsLoading,
    isRefreshing: statsRefreshing,
    lastUpdated: statsLastUpdated,
    refresh: refreshStats,
    error: statsError,
  } = useStatistics(normalizedInstitutionId ?? undefined);

  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [selectedCase, setSelectedCase] = useState<BaserowCaseRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [updatingCaseId, setUpdatingCaseId] = useState<number | null>(null);
  const [pauseErrors, setPauseErrors] = useState<Record<number, string | null>>({});
  const [totalCasesCount, setTotalCasesCount] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(50); // Quantos casos exibir por vez
  const isSysAdmin = normalizedInstitutionId === 4;
  const [selectedInstitution, setSelectedInstitution] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<CaseStage | "all">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adminInstitutions, setAdminInstitutions] = useState<InstitutionOption[]>([]);
  const [activeView, setActiveView] = useState<"lista" | "kanban">("lista");
  const normalizedStartDate = useMemo(
    () => parseDateInput(startDate),
    [startDate],
  );
  const normalizedEndDate = useMemo(
    () => parseDateInput(endDate, { endOfDay: true }),
    [endDate],
  );

  const caseInstitutionIds = useMemo(() => {
    if (!cases.length) return [];
    const unique = new Set<string>();
    cases.forEach((row) => {
      const normalizedId = getCaseInstitutionId(row);
      if (normalizedId) {
        unique.add(normalizedId);
      }
    });
    return Array.from(unique);
  }, [cases]);

  const institutionOptions = useMemo(() => {
    const sortOptions = (options: InstitutionOption[]) => {
      return options.sort((a, b) => {
        const numA = Number(a.id);
        const numB = Number(b.id);
        const isNumA = Number.isFinite(numA);
        const isNumB = Number.isFinite(numB);
        if (isNumA && isNumB) {
          return numA - numB;
        }
        if (isNumA) return -1;
        if (isNumB) return 1;
        return a.id.localeCompare(b.id);
      });
    };

    if (!isSysAdmin) {
      return sortOptions(
        caseInstitutionIds.map((id) => ({
          id,
          label: `Instituição #${id}`,
        })),
      );
    }

    const map = new Map<string, InstitutionOption>();
    adminInstitutions.forEach((option) => {
      map.set(option.id, option);
    });
    caseInstitutionIds.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, { id, label: `Instituição #${id}` });
      }
    });
    return sortOptions(Array.from(map.values()));
  }, [adminInstitutions, caseInstitutionIds, isSysAdmin]);

  const visibleCases = useMemo(() => {
    let filteredCases = [...cases];

    if (isSysAdmin && selectedInstitution !== "all") {
      filteredCases = filteredCases.filter(
        (row) => getCaseInstitutionId(row) === selectedInstitution,
      );
    }

    if (stageFilter !== "all") {
      filteredCases = filteredCases.filter(
        (row) => getCaseStage(row) === stageFilter,
      );
    }

    // Filtro por data
    if (normalizedStartDate || normalizedEndDate) {
      filteredCases = filteredCases.filter((row) => {
        if (!row.Data) return false;

        // Tenta converter a data do caso para um formato comparável
        // Suporta formatos: DD/MM/YYYY, YYYY-MM-DD, ou DD-MM-YYYY
        let caseDate: Date | null = null;
        const dataStr = row.Data.toString().trim();

        // Tenta formato DD/MM/YYYY ou DD-MM-YYYY
        const brMatch = dataStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (brMatch) {
          const [, day, month, year] = brMatch;
          caseDate = new Date(Number(year), Number(month) - 1, Number(day));
        } else {
          // Tenta formato ISO YYYY-MM-DD
          const isoMatch = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) {
            const [, year, month, day] = isoMatch;
            caseDate = new Date(Number(year), Number(month) - 1, Number(day));
          }
        }

        if (!caseDate || isNaN(caseDate.getTime())) return false;

        // Compara com as datas de filtro
        if (normalizedStartDate) {
          if (caseDate < normalizedStartDate) return false;
        }

        if (normalizedEndDate) {
          if (caseDate > normalizedEndDate) return false;
        }

        return true;
      });
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const numericQuery = normalizedQuery.replace(/\D/g, "");

    if (normalizedQuery) {
      filteredCases = filteredCases.filter((row) => {
        const matchesText = [
          row.CustumerName,
          row.CaseId,
          row.id,
          row.BJCaseId,
          row.CustumerPhone,
        ].some((value) => {
          if (value === null || value === undefined) {
            return false;
          }
          return value.toString().toLowerCase().includes(normalizedQuery);
        });

        let matchesPhoneDigits = false;
        if (numericQuery) {
          const phoneDigits = (row.CustumerPhone ?? "").replace(/\D/g, "");
          matchesPhoneDigits = phoneDigits.includes(numericQuery);
        }

        return matchesText || matchesPhoneDigits;
      });
    }

    // Dados já vêm ordenados (mais recentes primeiro)
    return filteredCases;
  }, [
    cases,
    isSysAdmin,
    selectedInstitution,
    searchQuery,
    stageFilter,
    normalizedStartDate,
    normalizedEndDate,
  ]);

  // Casos visíveis na tela (paginação virtual)
  const paginatedCases = useMemo(() => {
    return visibleCases.slice(0, visibleCount);
  }, [visibleCases, visibleCount]);

  // Verifica se há mais casos para carregar na visualização
  const hasMoreToShow = visibleCases.length > visibleCount;

  // Calcular estatísticas localmente a partir dos casos carregados
  const localStats = useMemo(() => {
    return computeCaseStatistics(cases);
  }, [cases]);

  // Usa estatísticas do servidor se disponíveis, senão usa estatísticas locais
  const caseStats = useMemo(() => {
    // Se tem erro ou servidor retornou zeros mas temos casos, usa local
    if (statsError || (serverStats.totalCases === 0 && cases.length > 0)) {
      return localStats;
    }
    return serverStats;
  }, [serverStats, localStats, statsError, cases.length]);

  const selectedInstitutionLabel = useMemo(() => {
    if (selectedInstitution === "all") return null;
    const match = institutionOptions.find(
      (option) => option.id === selectedInstitution,
    );
    return match?.label ?? `Instituição #${selectedInstitution}`;
  }, [institutionOptions, selectedInstitution]);

  const summaryScopeDescription = useMemo(() => {
    if (isSysAdmin) {
      return selectedInstitution === "all"
        ? "Consolidado de todas as instituições."
        : selectedInstitutionLabel ?? `Instituição #${selectedInstitution}`;
    }
    return "Dados da sua instituição.";
  }, [isSysAdmin, selectedInstitution, selectedInstitutionLabel]);

  useEffect(() => {
    if (!isSysAdmin) {
      setAdminInstitutions([]);
      return;
    }

    let isMounted = true;

    const fetchInstitutions = async () => {
      try {
        const configs = await getBaserowConfigs();
        if (!isMounted) return;

        const unique = new Map<string, InstitutionOption>();
        configs.forEach((row: BaserowConfigRow) => {
          const normalizedId = getCaseInstitutionId(
            row as unknown as BaserowCaseRow,
          );
          if (!normalizedId) {
            return;
          }

          const companyName =
            typeof row["body.tenant.companyName"] === "string"
              ? row["body.tenant.companyName"].trim()
              : "";
          const label = companyName
            ? `${companyName} (#${normalizedId})`
            : `Instituição #${normalizedId}`;

          if (!unique.has(normalizedId)) {
            unique.set(normalizedId, { id: normalizedId, label });
          }
        });

        setAdminInstitutions(Array.from(unique.values()));
      } catch (err) {
        console.error("Erro ao carregar lista de instituições:", err);
      }
    };

    fetchInstitutions();

    return () => {
      isMounted = false;
    };
  }, [isSysAdmin]);

  useEffect(() => {
    if (!isSysAdmin) return;
    if (
      selectedInstitution !== "all" &&
      !institutionOptions.some((option) => option.id === selectedInstitution)
    ) {
      setSelectedInstitution("all");
    }
  }, [institutionOptions, isSysAdmin, selectedInstitution]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    if (normalizedInstitutionId === null) {
      return;
    }

    // Verificar cache primeiro
    const cached = getCasesFromCache(normalizedInstitutionId);
    if (cached) {
      setCases(cached.cases);
      setTotalCasesCount(cached.totalCount);
      setIsLoading(false);
      // Atualiza em background
      loadCases(true);
    } else {
      loadCases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth, normalizedInstitutionId]);

  const loadCases = async (silent: boolean = false) => {
    if (!Number.isFinite(normalizedInstitutionId)) {
      setError("ID da instituicao nao encontrado");
      setIsLoading(false);
      return;
    }

    const institutionId = normalizedInstitutionId!;

    try {
      if (!silent) {
        setIsLoading(true);
        setCases([]);
        setError(null);
      }

      const response = await getBaserowCases({
        institutionId,
        pageSize: 200,
        fetchAll: true, // Carregar todos para ordenação correta
      });

      // Atualizar total de casos
      setTotalCasesCount(response.totalCount);

      // Ordenar por ID decrescente (mais recentes primeiro)
      const sortedResults = [...response.results].sort((a, b) => {
        const idA = a.id || 0;
        const idB = b.id || 0;
        return idB - idA;
      });

      setCases(sortedResults);
      setCasesCache(institutionId, sortedResults, response.totalCount);

      // Auto-assign unassigned cases (fire-and-forget)
      fetch("/api/v1/cases/auto-assign", { method: "POST" }).catch(() => {});
    } catch (err) {
      if (!silent) {
        console.error("Erro ao carregar casos:", err);
        setError(
          err instanceof Error ? err.message : "Erro ao carregar casos",
        );
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  // Função para mostrar mais casos (paginação virtual)
  const showMoreCases = useCallback(() => {
    setVisibleCount((prev) => prev + 50);
  }, []);

  // Ref para o elemento sentinela do infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll com IntersectionObserver
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreToShow) {
          showMoreCases();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreToShow, showMoreCases]);

  // Resetar visibleCount quando filtros mudam
  useEffect(() => {
    setVisibleCount(50);
  }, [selectedInstitution, searchQuery, stageFilter, normalizedStartDate, normalizedEndDate]);

  const handleCaseClick = (caseRow: BaserowCaseRow) => {
    setSelectedCase(caseRow);
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedCase(null);
    }
  };

  const handleToggleIAPause = async (
    caseRow: BaserowCaseRow | null,
    enabled: boolean,
  ) => {
    if (!caseRow) return;
    setPauseErrors((prev) => ({ ...prev, [caseRow.id]: null }));
    setUpdatingCaseId(caseRow.id);
    try {
      const payload = enabled ? { IApause: "SIM" } : { IApause: "" };
      const updatedCase = await updateBaserowCase(caseRow.id, payload);

      setCases((prevCases) =>
        prevCases.map((row) =>
          row.id === caseRow.id ? { ...row, ...payload, ...updatedCase } : row,
        ),
      );

      setSelectedCase((prevCase) =>
        prevCase && prevCase.id === caseRow.id
          ? { ...prevCase, ...payload, ...updatedCase }
          : prevCase,
      );
    } catch (err) {
      setPauseErrors((prev) => ({
        ...prev,
        [caseRow.id]:
          err instanceof Error ? err.message : "Erro ao atualizar IApause",
      }));
    } finally {
      setUpdatingCaseId(null);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando casos..." />;
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
              <Button onClick={() => loadCases()}>Tentar Novamente</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4">
        {/* Header compacto com título e estatísticas alinhados */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {/* View Tabs */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeView === "lista" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("lista")}
                className="gap-1.5 h-8"
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </Button>
              <Button
                variant={activeView === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("kanban")}
                className="gap-1.5 h-8"
              >
                <Kanban className="h-3.5 w-3.5" />
                Kanban
              </Button>
            </div>
          </div>

          {/* Estatísticas compactas inline - mesma linha do título */}
          <div className="flex flex-wrap items-center gap-3 ml-auto">
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                <span className="text-xs text-muted-foreground">Total:</span>
                <span className="text-sm font-bold text-primary">
                  {statsLoading && caseStats.totalCases === 0 ? "..." : (caseStats.totalCases || totalCasesCount || "...")}
                </span>
              </div>
              {stageOrder.map((stage) => (
                <div key={stage} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">{stageLabels[stage]}:</span>
                  <span className={cn("text-sm font-semibold", stageColors[stage].replace("bg-", "text-").replace("-100", "-700").replace("-900", "-300"))}>
                    {statsLoading && caseStats.stageCounts[stage] === 0 ? "..." : caseStats.stageCounts[stage]}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-lg border border-dashed bg-card px-3 py-1.5">
                <span className="text-xs text-muted-foreground">IA Pausada:</span>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {statsLoading && caseStats.pausedCases === 0 ? "..." : caseStats.pausedCases}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => refreshStats()}
                disabled={statsRefreshing}
                title={statsLastUpdated ? `Atualizado: ${statsLastUpdated.toLocaleTimeString("pt-BR")}` : "Atualizar estatísticas"}
              >
                {statsRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {statsLastUpdated && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {statsLastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-8">
                <Link href="/estatisticas">Ver mais</Link>
              </Button>
            {/* Só mostra erro se não tiver fallback local */}
            {statsError && cases.length === 0 && (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded" title={statsError}>
                {statsError}
              </span>
            )}
          </div>
        </div>

        {activeView === "kanban" ? (
          <div className="min-h-[600px]">
            <KanbanView
              cases={visibleCases}
              institutionId={normalizedInstitutionId!}
              onRefresh={() => loadCases()}
              onCaseUpdate={(caseId, updates) => {
                setCases((prev) =>
                  prev.map((c) => (c.id === caseId ? { ...c, ...updates } : c))
                );
              }}
            />
          </div>
        ) : (
          <>
        <div className="bg-transparent">
          <div className="space-y-4 pb-4">
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => loadCases()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex flex-col gap-1">
                <label
                  htmlFor="cases-search"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Buscar casos
                </label>
                <Input
                  id="cases-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nome, ID, BJCaseId ou telefone"
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="stage-filter"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Etapa
                </label>
                <select
                  id="stage-filter"
                  value={stageFilter}
                  onChange={(event) =>
                    setStageFilter(event.target.value as CaseStage | "all")
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="all">Todas</option>
                  {stageOrder.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabels[stage]}
                    </option>
                  ))}
                </select>
              </div>
              {isHydrated && (
                <>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="start-date"
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Data inicial
                    </label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="end-date"
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Data final
                    </label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="w-full"
                    />
                  </div>
                </>
              )}
              {isSysAdmin && (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="institution-filter"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Instituição
                  </label>
                  <select
                    id="institution-filter"
                    value={selectedInstitution}
                    onChange={(event) => setSelectedInstitution(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value="all">Todas</option>
                    {institutionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div>
            {visibleCases.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Nenhum caso encontrado.
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedCases.map((caseRow) => {
                  const stage = getCaseStage(caseRow);
                  const isPaused = isCasePaused(caseRow);
                  const pauseError = pauseErrors[caseRow.id];
                  return (
                    <div
                      key={caseRow.id}
                      onClick={() => handleCaseClick(caseRow)}
                      className="cursor-pointer border-b border-[#7E99B5] dark:border-border/60 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold truncate max-w-[200px]">
                          {caseRow.CustumerName || "Sem nome"}
                        </h3>
                        {stage && (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                              stageColors[stage],
                            )}
                          >
                            {stageLabels[stage]}
                          </span>
                        )}
                        {caseRow.Data && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {caseRow.Data}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-3">
                          <Link
                            href={`/chat?case=${caseRow.id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-900/30 dark:text-blue-200 whitespace-nowrap"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MessageSquareText className="h-3 w-3" />
                            Chat
                          </Link>
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Pausar IA
                            </span>
                            <Switch
                              checked={isPaused}
                              onCheckedChange={(checked) =>
                                handleToggleIAPause(caseRow, checked)
                              }
                              disabled={updatingCaseId === caseRow.id}
                              aria-label="Alternar pausa da IA neste caso"
                            />
                          </div>
                        </div>
                      </div>
                      {pauseError && (
                        <p className="text-xs text-destructive mt-1">
                          {pauseError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Sentinela para infinite scroll */}
            {hasMoreToShow && (
              <div ref={loadMoreRef} className="py-4 text-center">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Carregando mais...</span>
                </div>
              </div>
            )}
            {!hasMoreToShow && visibleCases.length > 0 && (
              <div className="py-4 text-center text-muted-foreground text-sm">
                Exibindo {paginatedCases.length} de {visibleCases.length} atendimentos
                {visibleCases.length < (totalCasesCount ?? cases.length) &&
                  ` (${totalCasesCount ?? cases.length} no total)`}
              </div>
            )}
          </div>
        </div>

        <KanbanCardDetail
          caseData={selectedCase}
          open={isDialogOpen}
          onOpenChange={handleDialogOpenChange}
          onCaseUpdate={(caseId, updates) => {
            setCases((prev) =>
              prev.map((c) => (c.id === caseId ? { ...c, ...updates } : c))
            );
          }}
        />
          </>
        )}
      </div>
    </main>
  );
}

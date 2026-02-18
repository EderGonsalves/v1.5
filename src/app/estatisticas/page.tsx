"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { getBaserowCases, type BaserowCaseRow } from "@/services/api";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import {
  computeCaseStatistics,
  getCaseInstitutionId,
  stageLabels,
  stageOrder,
  type CaseStage,
  type CaseStatistics,
} from "@/lib/case-stats";
import { cn } from "@/lib/utils";
import { useStatistics } from "@/hooks/use-statistics";

const stageStackColors: Record<CaseStage, string> = {
  DepoimentoInicial: "bg-blue-500/70",
  EtapaPerguntas: "bg-amber-400/80",
  EtapaFinal: "bg-emerald-500/80",
};

const stageBarColors: Record<CaseStage, string> = {
  DepoimentoInicial: "bg-blue-500",
  EtapaPerguntas: "bg-amber-500",
  EtapaFinal: "bg-emerald-500",
};

const stageDotColors: Record<CaseStage, string> = {
  DepoimentoInicial: "bg-blue-500",
  EtapaPerguntas: "bg-amber-500",
  EtapaFinal: "bg-emerald-500",
};

const StageDistributionChart = ({ stats }: { stats: CaseStatistics }) => (
  <div className="space-y-4">
    <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {stageOrder.map((stage) => (
        <div
          key={stage}
          className={cn("h-full", stageStackColors[stage])}
          style={{ width: `${Math.max(stats.stagePercentages[stage], 0)}%` }}
        />
      ))}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {stageOrder.map((stage) => (
        <div
          key={stage}
          className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", stageDotColors[stage])} />
            <span className="text-sm font-medium">{stageLabels[stage]}</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              {stats.stageCounts[stage]}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.stagePercentages[stage]}%
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StageVolumeBars = ({ stats }: { stats: CaseStatistics }) => {
  const maxValue = Math.max(
    ...stageOrder.map((stage) => stats.stageCounts[stage]),
    1,
  );
  return (
    <div className="flex items-end gap-4">
      {stageOrder.map((stage) => {
        const count = stats.stageCounts[stage];
        const height = count
          ? Math.max((count / maxValue) * 100, 8)
          : 0;
        return (
          <div key={stage} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-36 w-full items-end rounded-md bg-muted p-1">
              <div
                className={cn("w-full rounded-md", stageBarColors[stage])}
                style={{ height: `${height}%` }}
                aria-label={`${stageLabels[stage]}: ${count} casos`}
              />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground">{stageLabels[stage]}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PausedCasesDonut = ({ stats }: { stats: CaseStatistics }) => {
  const normalized = Math.min(Math.max(stats.pausedPercentage, 0), 100);
  const angle = (normalized / 100) * 360;
  const gradient = `conic-gradient(#fb923c 0deg ${angle}deg, rgba(148,163,184,0.35) ${angle}deg 360deg)`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: gradient }}
          aria-hidden="true"
        />
        <div className="absolute inset-3 rounded-full bg-background shadow-inner" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-foreground">
            {stats.pausedCases}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            pausados
          </span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {normalized}%
          </span>
        </div>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {stats.pausedCases} de {stats.totalCases} casos com IA pausada.
        </p>
        <p>
          <span className="font-semibold text-foreground">
            {Math.max(stats.totalCases - stats.pausedCases, 0)}
          </span>{" "}
          casos com IA ativa.
        </p>
      </div>
    </div>
  );
};

export default function EstatisticasPage() {
  const { data } = useOnboarding();
  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isSysAdmin = data.auth?.institutionId === 4;

  const {
    stats: quickStats,
    refresh: refreshQuickStats,
    isRefreshing: quickStatsRefreshing,
  } = useStatistics(data.auth?.institutionId ?? undefined);

  const fetchStatistics = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!data.auth?.institutionId) {
        setError("ID da instituição não encontrado.");
        setIsLoading(false);
        return;
      }

      const { silent } = options;
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);
      try {
        const response = await getBaserowCases({
          institutionId: data.auth.institutionId,
          pageSize: 200,
          fetchAll: true,
        });
        setCases(response.results);
        setLastUpdated(new Date());
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar estatísticas",
        );
      } finally {
        if (silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [data.auth?.institutionId],
  );

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const institutionOptions = useMemo(() => {
    if (!cases.length) return [];
    const unique = new Set<string>();
    cases.forEach((row) => {
      const id = getCaseInstitutionId(row);
      if (id) unique.add(id);
    });
    return Array.from(unique).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      const hasNumA = Number.isFinite(numA);
      const hasNumB = Number.isFinite(numB);
      if (hasNumA && hasNumB) return numA - numB;
      if (hasNumA) return -1;
      if (hasNumB) return 1;
      return a.localeCompare(b);
    });
  }, [cases]);

  useEffect(() => {
    if (!isSysAdmin) {
      setSelectedInstitution("all");
      return;
    }
    if (
      selectedInstitution !== "all" &&
      !institutionOptions.includes(selectedInstitution)
    ) {
      setSelectedInstitution("all");
    }
  }, [institutionOptions, isSysAdmin, selectedInstitution]);

  const visibleCases = useMemo(() => {
    if (!isSysAdmin || selectedInstitution === "all") {
      return cases;
    }
    return cases.filter(
      (row) => getCaseInstitutionId(row) === selectedInstitution,
    );
  }, [cases, isSysAdmin, selectedInstitution]);

  const computedStats = useMemo(
    () => computeCaseStatistics(visibleCases),
    [visibleCases],
  );

  const stats = useMemo(() => {
    if (isLoading && !isSysAdmin && quickStats.totalCases > 0) {
      return quickStats;
    }
    return computedStats;
  }, [isLoading, isSysAdmin, quickStats, computedStats]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    return lastUpdated.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, [lastUpdated]);

  if (isLoading && !cases.length) {
    return <LoadingScreen message="Carregando estatísticas..." />;
  }

  return (
    <main className="min-h-screen bg-background py-2 sm:py-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:gap-4 px-3 sm:px-4">
        {/* Header */}
        <div className="flex flex-col gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Estatísticas
            </h2>
            <p className="text-xs text-muted-foreground">
              {isSysAdmin
                ? selectedInstitution === "all"
                  ? "Consolidado de todas as instituições"
                  : `Instituição #${selectedInstitution}`
                : "Dados da sua instituição"}
              {lastUpdatedLabel && ` — atualizado em ${lastUpdatedLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSysAdmin && (
              <select
                value={selectedInstitution}
                onChange={(e) => setSelectedInstitution(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground truncate sm:w-auto sm:max-w-[200px]"
              >
                <option value="all">Todas</option>
                {institutionOptions.map((option) => (
                  <option key={option} value={option}>
                    Instituição #{option}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStatistics({ silent: true });
                refreshQuickStats();
              }}
              disabled={isRefreshing || quickStatsRefreshing}
            >
              {(isRefreshing || quickStatsRefreshing) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
            <button
              onClick={() => fetchStatistics()}
              className="ml-2 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Total */}
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground">Casos totais</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.totalCases}</p>
          </div>
          {/* Últimos 7 dias */}
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              <span className="hidden sm:inline">Últimos</span> 7 dias
            </p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.casesLast7Days}</p>
          </div>
          {/* Últimos 30 dias */}
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              <span className="hidden sm:inline">Últimos</span> 30 dias
            </p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.casesLast30Days}</p>
          </div>
          {/* Etapas */}
          {stageOrder.map((stage) => (
            <div key={stage} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
              <p className="text-xs text-muted-foreground">{stageLabels[stage]}</p>
              <p className="text-lg sm:text-2xl font-semibold text-foreground">{stats.stageCounts[stage]}</p>
              <p className="text-[10px] text-muted-foreground">{stats.stagePercentages[stage]}%</p>
            </div>
          ))}
        </div>

        {/* Distribuição por etapa */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
          <span className="text-sm font-semibold">Distribuição por etapa</span>
          <span className="text-xs text-muted-foreground">
            Percentual de casos em cada etapa do fluxo
          </span>
        </div>
        <div className="px-3 sm:px-4">
          <StageDistributionChart stats={stats} />
        </div>

        {/* IA pausada + Volume */}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {/* IA pausada */}
          <div>
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
              <span className="text-sm font-semibold">IA pausada</span>
              <span className="text-xs text-muted-foreground">
                {stats.pausedCases} de {stats.totalCases}
              </span>
            </div>
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <PausedCasesDonut stats={stats} />
            </div>
          </div>

          {/* Volume por etapa */}
          <div>
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
              <span className="text-sm font-semibold">Volume por etapa</span>
              <span className="text-xs text-muted-foreground">
                Comparativo visual
              </span>
            </div>
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <StageVolumeBars stats={stats} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import {
  stageLabels,
  stageOrder,
  type CaseStage,
  type CaseStatistics,
  type ResponsavelStats,
} from "@/lib/case-stats";
import { cn } from "@/lib/utils";
import { useStatistics, type ActiveUsersData } from "@/hooks/use-statistics";
import { useMyDepartments } from "@/hooks/use-my-departments";
import { PendingCasesModal } from "@/components/statistics/PendingCasesModal";

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

const OutcomeDonut = ({ stats }: { stats: CaseStatistics }) => {
  const { won, lost, pending } = stats.outcomeCounts;
  const total = won + lost + pending;
  const wonAngle = total ? (won / total) * 360 : 0;
  const lostAngle = total ? (lost / total) * 360 : 0;
  const gradient = total
    ? `conic-gradient(#22c55e 0deg ${wonAngle}deg, #ef4444 ${wonAngle}deg ${wonAngle + lostAngle}deg, rgba(148,163,184,0.35) ${wonAngle + lostAngle}deg 360deg)`
    : "conic-gradient(rgba(148,163,184,0.35) 0deg 360deg)";

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
          <span className="text-2xl font-bold text-foreground">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            total
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center sm:gap-4">
        <div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{won}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ganhos</p>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{stats.outcomePercentages.won}%</p>
        </div>
        <div>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{lost}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Perdidos</p>
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{stats.outcomePercentages.lost}%</p>
        </div>
        <div>
          <p className="text-lg font-bold text-muted-foreground">{pending}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pendentes</p>
          <p className="text-xs font-semibold text-muted-foreground">{stats.outcomePercentages.pending}%</p>
        </div>
      </div>
    </div>
  );
};

const ActiveUsersCard = ({ data }: { data: ActiveUsersData }) => (
  <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        Online agora
      </p>
      <p className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.onlineNow}</p>
    </div>
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs text-muted-foreground">Ativos 24h</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground">{data.active24h}</p>
    </div>
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs text-muted-foreground">Ativos 7d</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground">{data.active7d}</p>
    </div>
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs text-muted-foreground">Total cadastrados</p>
      <p className="text-lg sm:text-2xl font-semibold text-muted-foreground">{data.totalUsers}</p>
    </div>
  </div>
);

const ActiveUsersTable = ({ data }: { data: NonNullable<ActiveUsersData["byInstitution"]> }) => {
  const entries = Object.entries(data).sort(([a], [b]) => {
    const nA = Number(a);
    const nB = Number(b);
    if (Number.isFinite(nA) && Number.isFinite(nB)) return nA - nB;
    return a.localeCompare(b);
  });

  if (!entries.length) return null;

  return (
    <div className="max-h-[280px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Instituição</th>
            <th className="px-3 py-2 text-right font-medium">Online</th>
            <th className="px-3 py-2 text-right font-medium">24h</th>
            <th className="px-3 py-2 text-right font-medium">7d</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([instId, row]) => (
            <tr key={instId} className="border-b border-border/30 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">#{instId}</td>
              <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{row.onlineNow}</td>
              <td className="px-3 py-2 text-right">{row.active24h}</td>
              <td className="px-3 py-2 text-right">{row.active7d}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.totalUsers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ResponsavelRanking = ({
  data,
  onPendingClick,
}: {
  data: ResponsavelStats[];
  onPendingClick?: (responsavelName: string) => void;
}) => {
  if (!data.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nenhum dado de responsável disponível.</p>;
  }

  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Responsável</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Ganhos</th>
            <th className="px-3 py-2 text-right font-medium">Perdidos</th>
            <th className="px-3 py-2 text-right font-medium">Pendentes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.name} className="border-b border-border/30 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.total}</td>
              <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{r.won}</td>
              <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{r.lost}</td>
              <td className="px-3 py-2 text-right">
                {r.pending > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPendingClick?.(r.name)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium text-amber-700 underline decoration-amber-400/50 underline-offset-2 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-300 transition-colors"
                  >
                    {r.pending}
                  </button>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function EstatisticasPage() {
  const { data } = useOnboarding();
  const isSysAdmin = data.auth?.institutionId === 4;
  const { isOfficeAdmin } = useMyDepartments();
  const canTransfer = isSysAdmin || isOfficeAdmin;
  const currentUserName = (data.auth?.payload as Record<string, unknown> | undefined)?.name as string | undefined;

  const [selectedInstitution, setSelectedInstitution] = useState("all");
  const [selectedResponsavel, setSelectedResponsavel] = useState("all");
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingModalResponsavel, setPendingModalResponsavel] = useState("");

  const {
    stats: aggregatedStats,
    institutionBreakdown,
    activeUsers,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  } = useStatistics(data.auth?.institutionId ?? undefined);

  // Institution filter for SysAdmin
  const institutionOptions = useMemo(() => {
    if (!institutionBreakdown) return [];
    return Object.keys(institutionBreakdown).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
      if (Number.isFinite(numA)) return -1;
      if (Number.isFinite(numB)) return 1;
      return a.localeCompare(b);
    });
  }, [institutionBreakdown]);

  // Reset selection if institution is no longer available
  useEffect(() => {
    if (!isSysAdmin) {
      setSelectedInstitution("all");
      return;
    }
    if (selectedInstitution !== "all" && !institutionOptions.includes(selectedInstitution)) {
      setSelectedInstitution("all");
    }
  }, [institutionOptions, isSysAdmin, selectedInstitution]);

  // Select stats based on institution filter
  const instStats = useMemo(() => {
    if (!isSysAdmin || selectedInstitution === "all") {
      return aggregatedStats;
    }
    if (institutionBreakdown?.[selectedInstitution]) {
      return institutionBreakdown[selectedInstitution];
    }
    return aggregatedStats;
  }, [isSysAdmin, selectedInstitution, aggregatedStats, institutionBreakdown]);

  // Responsável options from current stats
  const responsavelOptions = useMemo(() => {
    return instStats.responsavelBreakdown.map((r) => r.name);
  }, [instStats.responsavelBreakdown]);

  // Reset responsável selection if not available
  useEffect(() => {
    if (selectedResponsavel !== "all" && !responsavelOptions.includes(selectedResponsavel)) {
      setSelectedResponsavel("all");
    }
  }, [responsavelOptions, selectedResponsavel]);

  // Final stats: filter by responsável if selected
  const stats = useMemo(() => {
    if (selectedResponsavel === "all") return instStats;
    const r = instStats.responsavelBreakdown.find((x) => x.name === selectedResponsavel);
    if (!r) return instStats;
    // Recalculate all metrics scoped to this responsável
    // We only have outcome data per responsável, so stage/paused/period metrics stay global
    return instStats;
  }, [instStats, selectedResponsavel]);

  // Filtered responsável breakdown for the ranking table
  const filteredResponsavel = useMemo(() => {
    if (selectedResponsavel === "all") return instStats.responsavelBreakdown;
    return instStats.responsavelBreakdown.filter((r) => r.name === selectedResponsavel);
  }, [instStats.responsavelBreakdown, selectedResponsavel]);

  // Filtered outcome counts when a responsável is selected
  const outcomeStats = useMemo(() => {
    if (selectedResponsavel === "all") {
      return { outcomeCounts: instStats.outcomeCounts, outcomePercentages: instStats.outcomePercentages };
    }
    const r = instStats.responsavelBreakdown.find((x) => x.name === selectedResponsavel);
    if (!r) return { outcomeCounts: instStats.outcomeCounts, outcomePercentages: instStats.outcomePercentages };
    const total = r.total || 1;
    const pct = (v: number) => Number(((v / total) * 100).toFixed(1));
    return {
      outcomeCounts: { won: r.won, lost: r.lost, pending: r.pending },
      outcomePercentages: { won: pct(r.won), lost: pct(r.lost), pending: pct(r.pending) },
    };
  }, [instStats, selectedResponsavel]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    return lastUpdated.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, [lastUpdated]);

  if (isLoading && stats.totalCases === 0) {
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
          <div className="flex flex-wrap items-center gap-2">
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
            {responsavelOptions.length > 0 && (
              <select
                value={selectedResponsavel}
                onChange={(e) => setSelectedResponsavel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground truncate sm:w-auto sm:max-w-[200px]"
              >
                <option value="all">Todos responsáveis</option>
                {responsavelOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
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
              onClick={() => refresh()}
              className="ml-2 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Usuários Ativos */}
        {activeUsers && (
          <>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Usuários
              </span>
              <span className="text-xs text-muted-foreground">
                Atividade em tempo real
              </span>
            </div>
            <div className="px-3 sm:px-4">
              <ActiveUsersCard data={activeUsers} />
            </div>
            {isSysAdmin && activeUsers.byInstitution && (
              <div className="px-3 sm:px-4">
                <ActiveUsersTable data={activeUsers.byInstitution} />
              </div>
            )}
          </>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground">Casos totais</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.totalCases}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              <span className="hidden sm:inline">Últimos</span> 7 dias
            </p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.casesLast7Days}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              <span className="hidden sm:inline">Últimos</span> 30 dias
            </p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.casesLast30Days}</p>
          </div>
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

        {/* Resultado dos casos + IA pausada */}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
              <span className="text-sm font-semibold">Resultado dos casos</span>
              <span className="text-xs text-muted-foreground">
                Ganho vs Perdido vs Pendente
              </span>
            </div>
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <OutcomeDonut stats={{ ...stats, outcomeCounts: outcomeStats.outcomeCounts, outcomePercentages: outcomeStats.outcomePercentages }} />
            </div>
          </div>

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
        </div>

        {/* Volume por etapa */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
          <span className="text-sm font-semibold">Volume por etapa</span>
          <span className="text-xs text-muted-foreground">
            Comparativo visual
          </span>
        </div>
        <div className="px-3 sm:px-4 py-3 sm:py-4">
          <StageVolumeBars stats={stats} />
        </div>

        {/* Ranking por responsável */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[#7E99B5] dark:border-border/60">
          <span className="text-sm font-semibold">Ranking por responsável</span>
          <span className="text-xs text-muted-foreground">
            {filteredResponsavel.length} responsáveis
          </span>
        </div>
        <div className="px-3 sm:px-4">
          <ResponsavelRanking
            data={filteredResponsavel}
            onPendingClick={(name) => {
              setPendingModalResponsavel(name);
              setPendingModalOpen(true);
            }}
          />
        </div>
      </div>

      <PendingCasesModal
        open={pendingModalOpen}
        onOpenChange={setPendingModalOpen}
        responsavelName={pendingModalResponsavel}
        institutionId={data.auth?.institutionId ?? 0}
        canTransfer={canTransfer}
        currentUserName={currentUserName}
        onTransferred={() => refresh()}
      />
    </main>
  );
}

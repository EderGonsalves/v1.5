"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { RefreshCw } from "lucide-react";

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
  <div className="space-y-6">
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
            <div className="flex h-40 w-full items-end rounded-md bg-muted p-1">
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
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-40 w-40">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: gradient }}
          aria-hidden="true"
        />
        <div className="absolute inset-4 rounded-full bg-background shadow-inner" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-bold text-foreground">
            {stats.pausedCases}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            pausados
          </span>
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            {normalized}%
          </span>
        </div>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          {stats.pausedCases} de {stats.totalCases} casos estão com a IA pausada.
        </p>
        <p>
          <span className="font-semibold text-foreground">
            {Math.max(stats.totalCases - stats.pausedCases, 0)} casos
          </span>{" "}
          seguem com a IA ativa.
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

  const stats = useMemo(
    () => computeCaseStatistics(visibleCases),
    [visibleCases],
  );

  const scopeDescription = useMemo(() => {
    if (isSysAdmin) {
      return selectedInstitution === "all"
        ? "Consolidado de todas as instituições"
        : `Instituição #${selectedInstitution}`;
    }
    return "Dados exclusivos da sua instituição";
  }, [isSysAdmin, selectedInstitution]);

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
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Painel de Estatísticas
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Visão geral dos atendimentos
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Acompanhe a evolução dos atendimentos por etapa e identifique rapidamente a carga de trabalho da equipe.
          </p>
        </section>

        {error && (
          <Card className="border-destructive/60 bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-destructive">Não foi possível carregar tudo</CardTitle>
              <CardDescription className="text-destructive">
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => fetchStatistics()} variant="outline">
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Escopo
            </span>
            <span className="text-base font-medium text-foreground">
              {scopeDescription}
            </span>
            {lastUpdatedLabel && (
              <span className="text-xs text-muted-foreground">
                Atualizado em {lastUpdatedLabel}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {isSysAdmin && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="stats-institution"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Instituição
                </label>
                <select
                  id="stats-institution"
                  value={selectedInstitution}
                  onChange={(event) => setSelectedInstitution(event.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="all">Todas</option>
                  {institutionOptions.map((option) => (
                    <option key={option} value={option}>
                      Instituição #{option}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStatistics({ silent: true })}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="py-3 gap-2 h-[140px]">
            <CardHeader className="pb-1 pt-2 space-y-1">
              <CardDescription>Casos totais</CardDescription>
              <CardTitle className="text-3xl font-bold">{stats.totalCases}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 pb-2 text-xs text-muted-foreground">
              {stats.totalCases === 1 ? "1 caso registrado" : `${stats.totalCases} casos registrados`}
            </CardContent>
          </Card>
          {stageOrder.map((stage) => (
            <Card key={stage} className="py-3 gap-2 h-[140px]">
              <CardHeader className="pb-1 pt-2 space-y-1">
                <CardDescription>{stageLabels[stage]}</CardDescription>
                <CardTitle className="text-2xl font-semibold">
                  {stats.stageCounts[stage]}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-2 text-xs text-muted-foreground">
                {stats.stagePercentages[stage]}% do total
              </CardContent>
            </Card>
          ))}
          <Card className="py-3 gap-2 h-[140px]">
            <CardHeader className="pb-1 pt-2 space-y-1">
              <CardDescription>Casos com IA pausada</CardDescription>
              <CardTitle className="text-2xl font-semibold">
                {stats.pausedCases}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1 pb-2 text-xs text-muted-foreground">
              {stats.pausedPercentage}% dos casos estão pausados
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Distribuição por etapa</CardTitle>
              <CardDescription>
                Percentual de casos em cada etapa do fluxo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StageDistributionChart stats={stats} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>IA pausada</CardTitle>
              <CardDescription>Monitore os atendimentos suspensos.</CardDescription>
            </CardHeader>
            <CardContent>
              <PausedCasesDonut stats={stats} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Volume por etapa</CardTitle>
              <CardDescription>
                Comparativo visual entre as etapas em números absolutos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StageVolumeBars stats={stats} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

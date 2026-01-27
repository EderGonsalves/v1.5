"use client";

import { useEffect, useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBaserowCases,
  getBaserowConfigs,
  updateBaserowCase,
  type BaserowCaseRow,
  type BaserowConfigRow,
} from "@/services/api";
import { ConversationView } from "@/components/casos/ConversationView";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { MessageCircle, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

type InstitutionOption = {
  id: string;
  label: string;
};

export default function CasosPage() {
  const { data } = useOnboarding();
  const router = useRouter();
  const normalizedInstitutionId = useMemo(() => {
    const value = data.auth?.institutionId;
    if (value === undefined || value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data.auth?.institutionId]);
  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [selectedCase, setSelectedCase] = useState<BaserowCaseRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [updatingCaseId, setUpdatingCaseId] = useState<number | null>(null);
  const [pauseErrors, setPauseErrors] = useState<Record<number, string | null>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isSysAdmin = normalizedInstitutionId === 4;
  const [selectedInstitution, setSelectedInstitution] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<CaseStage | "all">("all");
  const [adminInstitutions, setAdminInstitutions] = useState<InstitutionOption[]>([]);

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

    return filteredCases.sort((a, b) => {
      const idA = a.CaseId || a.id || 0;
      const idB = b.CaseId || b.id || 0;
      return idB - idA;
    });
  }, [cases, isSysAdmin, selectedInstitution, searchQuery, stageFilter]);

  const caseStats = useMemo(
    () => computeCaseStatistics(visibleCases),
    [visibleCases],
  );

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
    if (!data.auth) {
      router.push("/");
      return;
    }
    if (normalizedInstitutionId === null) {
      return;
    }
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.auth, normalizedInstitutionId]);

  const loadCases = async (page: number = 1, append: boolean = false) => {
    if (!Number.isFinite(normalizedInstitutionId)) {
      setError("ID da instituicao nao encontrado");
      setIsLoading(false);
      return;
    }

    const institutionId = normalizedInstitutionId!;

    try {
      if (!append) {
        setIsLoading(true);
        setCurrentPage(1);
        setHasMore(true);
        setCases([]);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      console.log(
        "Carregando casos do Baserow para institutionId:",
        institutionId,
        "page:",
        page,
      );
      const response = await getBaserowCases({
        institutionId,
        page,
        pageSize: 50,
        fetchAll: !append,
      });
      console.log("Atendimentos encontrados:", response);
      
      if (append) {
        setCases((prev) => [...prev, ...response.results]);
        setHasMore(response.hasNextPage);
      } else {
        setCases(response.results);
        setHasMore(response.hasNextPage);
      }
    } catch (err) {
      console.error("Erro ao carregar casos:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar casos",
      );
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMoreCases = () => {
    if (hasMore && !isLoadingMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadCases(nextPage, true);
    }
  };

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
      <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
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
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            GestÃ£o de Casos
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Atendimentos
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Visualize e gerencie todos os atendimentos. Ordenados do mais recente para o mais antigo.
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Resumo das estatísticas
              </h2>
              <p className="text-sm text-muted-foreground">
                {summaryScopeDescription}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/estatisticas">Abrir painel completo</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <Card className="border-t-4 border-primary py-3 gap-2 h-[140px]">
              <CardHeader className="pb-1 pt-2 space-y-1">
                <CardDescription>Total de atendimentos</CardDescription>
                <CardTitle className="text-2xl font-bold">
                  {caseStats.totalCases}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-2">
                <p className="text-xs text-muted-foreground">
                  {caseStats.pausedCases} com IA pausada
                </p>
              </CardContent>
            </Card>
            {stageOrder.map((stage) => (
              <Card key={stage} className="py-3 gap-2 h-[140px]">
                <CardHeader className="pb-1 pt-2 space-y-1">
                  <CardDescription>{stageLabels[stage]}</CardDescription>
                  <CardTitle className="text-2xl font-semibold">
                    {caseStats.stageCounts[stage]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-1 pb-2">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Participação
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      stageColors[stage],
                    )}
                  >
                    {caseStats.stagePercentages[stage]}%
                  </span>
                </CardContent>
              </Card>
            ))}
            <Card className="border-dashed py-3 gap-2 h-[140px]">
              <CardHeader className="pb-1 pt-2 space-y-1">
                <CardDescription>IA pausada</CardDescription>
                <CardTitle className="text-2xl font-semibold">
                  {caseStats.pausedCases}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-2">
                <p className="text-xs text-muted-foreground">
                  {caseStats.pausedPercentage}% do total
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-[width]"
                    style={{
                      width: `${Math.min(caseStats.pausedPercentage, 100)}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Lista de Atendimentos</CardTitle>
                <CardDescription>
                  {visibleCases.length}{" "}
                  {visibleCases.length === 1 ? "atendimento" : "atendimentos"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-1">
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
                    className="w-full min-w-[220px]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="stage-filter"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Filtrar por etapa
                  </label>
                  <select
                    id="stage-filter"
                    value={stageFilter}
                    onChange={(event) =>
                      setStageFilter(event.target.value as CaseStage | "all")
                    }
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value="all">Todas</option>
                    {stageOrder.map((stage) => (
                      <option key={stage} value={stage}>
                        {stageLabels[stage]}
                      </option>
                    ))}
                  </select>
                </div>
                {isSysAdmin && (
                  <div className="flex flex-col gap-1 text-right">
                    <label
                      htmlFor="institution-filter"
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Filtrar por instituição
                    </label>
                    <select
                      id="institution-filter"
                      value={selectedInstitution}
                      onChange={(event) => setSelectedInstitution(event.target.value)}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
                {hasMore && (
                  <Button 
                    onClick={loadMoreCases}
                    disabled={isLoadingMore}
                    variant="outline"
                    size="sm"
                  >
                    {isLoadingMore ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Carregar mais ({50 * currentPage})
                      </>
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => loadCases()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {visibleCases.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Nenhum caso encontrado.
              </div>
            ) : (
              <div className="space-y-4">
                {visibleCases.map((caseRow) => {
                  const stage = getCaseStage(caseRow);
                  const isPaused = isCasePaused(caseRow);
                  const pauseError = pauseErrors[caseRow.id];
                  return (
                    <div
                      key={caseRow.id}
                      onClick={() => handleCaseClick(caseRow)}
                      className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold">
                              {caseRow.CustumerName || "Sem nome"}
                            </h3>
                            {stage && (
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  stageColors[stage],
                                )}
                              >
                                {stageLabels[stage]}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            {caseRow.Data && (
                              <span className="text-xs">
                                Data: {caseRow.Data}
                              </span>
                            )}
                            {caseRow.CustumerPhone ? (
                              <a
                                href={`https://app.riasistemas.com.br/whatsapp${caseRow.CustumerPhone ? `?phone=${encodeURIComponent(caseRow.CustumerPhone)}` : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-full border border-green-500/30 bg-green-50 p-2 text-green-600 transition hover:bg-green-100 dark:border-green-500/50 dark:bg-green-900/30 dark:text-green-300"
                                aria-label={`Conversar via WhatsApp com ${caseRow.CustumerName || "cliente"} (${caseRow.CustumerPhone})`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            ) : (
                              <span>Sem telefone</span>
                            )}
                            <div
                              className="flex items-center gap-2"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <span className="text-xs font-medium uppercase tracking-wide">
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
                          {pauseError && (
                            <p className="text-xs text-destructive">
                              {pauseError}
                            </p>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground text-right space-y-1">
                          <div>ID: {caseRow.CaseId || caseRow.id}</div>
                          {caseRow.BJCaseId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-7 px-3"
                            >
                              <a
                                href={`https://app.riasistemas.com.br/case/edit/${caseRow.BJCaseId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Editar
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground/70">
                              BJCaseId não informado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!hasMore && visibleCases.length > 0 && (
              <div className="py-4 text-center text-muted-foreground text-sm">
                ✅ Todos os {visibleCases.length} Atendimentos foram carregados
              </div>
            )}
          </CardContent>
        </Card>

        {selectedCase && (
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedCase.CustumerName || "Cliente sem nome"}
                </DialogTitle>
                <DialogDescription>
                  {selectedCase.CustumerPhone || "Sem telefone"}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <Tabs defaultValue="conversa" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="conversa">Conversa</TabsTrigger>
                    <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  </TabsList>
                  <TabsContent value="conversa" className="mt-4">
                    <div className="rounded-lg border p-4 min-h-[300px] max-h-[500px] overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
                      <ConversationView conversation={selectedCase.Conversa || ""} />
                    </div>
                  </TabsContent>
                  <TabsContent value="resumo" className="mt-4">
                    <div className="rounded-lg border p-4 min-h-[300px]">
                      {selectedCase.Resumo ? (
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {selectedCase.Resumo}
                        </pre>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          Nenhum resumo registrado.
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </main>
  );
}

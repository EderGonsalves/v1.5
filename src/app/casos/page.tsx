"use client";

import { useEffect, useState } from "react";
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
import { getBaserowCases, type BaserowCaseRow } from "@/services/api";
import { ConversationView } from "@/components/casos/ConversationView";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useRouter } from "next/navigation";

type CaseStage = "DepoimentoInicial" | "EtapaPerguntas" | "EtapaFinal";

const stageLabels: Record<CaseStage, string> = {
  DepoimentoInicial: "Depoimento Inicial",
  EtapaPerguntas: "Etapa Perguntas",
  EtapaFinal: "Etapa Final",
};

const stageColors: Record<CaseStage, string> = {
  DepoimentoInicial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EtapaPerguntas: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  EtapaFinal: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function getCaseStage(caseRow: BaserowCaseRow): CaseStage | null {
  if (caseRow.EtapaFinal) return "EtapaFinal";
  if (caseRow.EtapaPerguntas) return "EtapaPerguntas";
  if (caseRow.DepoimentoInicial) return "DepoimentoInicial";
  return null;
}

export default function CasosPage() {
  const { data } = useOnboarding();
  const router = useRouter();
  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [selectedCase, setSelectedCase] = useState<BaserowCaseRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!data.auth) {
      router.push("/");
      return;
    }
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.auth]);

  const loadCases = async () => {
    if (!data.auth?.institutionId) {
      setError("ID da instituição não encontrado");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log("Carregando casos do Baserow para institutionId:", data.auth.institutionId);
      const results = await getBaserowCases(data.auth.institutionId);
      console.log("Casos encontrados:", results);
      setCases(results);
    } catch (err) {
      console.error("Erro ao carregar casos:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar casos",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCaseClick = (caseRow: BaserowCaseRow) => {
    setSelectedCase(caseRow);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedCase(null);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Carregando casos...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
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
              <Button onClick={loadCases}>Tentar Novamente</Button>
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
            Gestão de Casos
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Casos de Atendimento
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Visualize e gerencie todos os casos de atendimento.
          </p>
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Lista de Casos</CardTitle>
                <CardDescription>
                  {cases.length} {cases.length === 1 ? "caso encontrado" : "casos encontrados"}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={loadCases}>
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {cases.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Nenhum caso encontrado.
              </div>
            ) : (
              <div className="space-y-4">
                {cases.map((caseRow) => {
                  const stage = getCaseStage(caseRow);
                  return (
                    <div
                      key={caseRow.id}
                      onClick={() => handleCaseClick(caseRow)}
                      className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
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
                          <p className="text-sm text-muted-foreground">
                            {caseRow.CustumerPhone || "Sem telefone"}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ID: {caseRow.CaseId || caseRow.id}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedCase && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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


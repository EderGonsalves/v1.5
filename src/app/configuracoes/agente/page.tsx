"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getBaserowConfigs,
  updateBaserowConfig,
  type BaserowConfigRow,
} from "@/services/api";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  type AgentPhaseConfig,
  DEFAULT_PHASE_PROMPTS,
  DEFAULT_DISQUALIFICATION_MESSAGE,
  DEFAULT_FINALIZATION_FEATURES,
  FINALIZATION_FEATURES,
  type FinalizationFeatureId,
} from "@/lib/validations";
import { buildPhaseConfigFields, readPhaseConfigFromRow } from "@/lib/baserow";

type PhaseKey = "initial" | "questions" | "finalization";

const PHASE_META: Record<
  PhaseKey,
  { title: string; description: string; defaultPrompt: string }
> = {
  initial: {
    title: "Etapa Inicial (Boas-Vindas)",
    description:
      "O agente se apresenta, coleta o nome do cliente e solicita o relato livre do caso.",
    defaultPrompt: DEFAULT_PHASE_PROMPTS.initial,
  },
  questions: {
    title: "Etapa de Perguntas (Coleta)",
    description:
      "O agente faz perguntas complementares para completar o briefing jurídico.",
    defaultPrompt: DEFAULT_PHASE_PROMPTS.questions,
  },
  finalization: {
    title: "Etapa Final (Fechamento)",
    description:
      "O agente agradece, oferece funcionalidades ativas e encerra o atendimento.",
    defaultPrompt: DEFAULT_PHASE_PROMPTS.finalization,
  },
};

export default function AgentConfigPage() {
  const router = useRouter();
  const { data, isHydrated } = useOnboarding();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [configRowId, setConfigRowId] = useState<number | null>(null);
  const [phaseConfig, setPhaseConfig] = useState<AgentPhaseConfig>({
    phases: {
      initial: { customPrompt: "" },
      questions: { customPrompt: "" },
      finalization: { customPrompt: "" },
    },
    qualificationRules: "",
    disqualificationMessage: DEFAULT_DISQUALIFICATION_MESSAGE,
    finalizationFeatures: { ...DEFAULT_FINALIZATION_FEATURES },
  });

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth]);

  const loadConfig = useCallback(async () => {
    if (!data.auth) return;
    setIsLoading(true);
    setError(null);
    try {
      const configs = await getBaserowConfigs(data.auth.institutionId);
      if (configs.length === 0) {
        setIsLoading(false);
        return;
      }
      // Usar o config mais recente (maior ID)
      const latest = configs.reduce((cur, cand) =>
        cand.id > cur.id ? cand : cur,
        configs[0],
      );
      setConfigRowId(latest.id);
      const row = latest as Record<string, unknown>;
      setPhaseConfig(readPhaseConfigFromRow(row));
    } catch (err) {
      console.error("Erro ao carregar configuração do agente:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar configuração",
      );
    } finally {
      setIsLoading(false);
    }
  }, [data.auth]);

  const handleSave = async () => {
    if (!configRowId) {
      setError("Nenhuma configuração encontrada para salvar");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const fields = buildPhaseConfigFields(phaseConfig);
      await updateBaserowConfig(configRowId, fields);
      setSuccessMessage("Configurações do agente salvas com sucesso!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error("Erro ao salvar configuração do agente:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao salvar configuração",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updatePhasePrompt = (phase: PhaseKey, value: string) => {
    setPhaseConfig((prev) => ({
      ...prev,
      phases: {
        ...prev.phases,
        [phase]: { customPrompt: value },
      },
    }));
  };

  const resetPhasePrompt = (phase: PhaseKey) => {
    updatePhasePrompt(phase, "");
  };

  const toggleFeature = (featureId: FinalizationFeatureId) => {
    setPhaseConfig((prev) => ({
      ...prev,
      finalizationFeatures: {
        ...prev.finalizationFeatures,
        [featureId]: !prev.finalizationFeatures[featureId],
      },
    }));
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando configuração do agente..." />;
  }

  return (
    <div>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="border-b border-destructive px-3 sm:px-4 py-3">
            <p className="text-sm font-semibold text-destructive">Erro</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="border-b border-emerald-300 dark:border-emerald-700 px-3 sm:px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30">
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              {successMessage}
            </p>
          </div>
        )}

        {!configRowId && !error && (
          <div className="py-12 text-center text-muted-foreground">
            Nenhuma configuração encontrada. Complete o onboarding primeiro.
          </div>
        )}

        {configRowId && (
          <>
            {/* Fases do agente */}
            {(Object.keys(PHASE_META) as PhaseKey[]).map((phaseKey, idx) => {
              const meta = PHASE_META[phaseKey];
              const currentPrompt = phaseConfig.phases[phaseKey].customPrompt;

              return (
                <div
                  key={phaseKey}
                  className={`border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-4 ${
                    idx === 0 ? "" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {meta.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    {currentPrompt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => resetPhasePrompt(phaseKey)}
                        title="Restaurar comportamento padrão"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Padrão
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Instruções adicionais (opcional)
                    </Label>
                    <Textarea
                      value={currentPrompt}
                      onChange={(e) =>
                        updatePhasePrompt(phaseKey, e.target.value)
                      }
                      placeholder={meta.defaultPrompt}
                      className="text-xs min-h-[80px]"
                      rows={3}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Deixe vazio para usar o comportamento padrão. Texto
                      adicionado aqui será incluído como instrução extra no
                      prompt do agente.
                    </p>
                  </div>

                  {/* Qualificacao: aparece apenas na fase de perguntas */}
                  {phaseKey === "questions" && (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                      <div>
                        <Label className="text-sm font-semibold text-foreground">
                          Regras de Qualificação
                        </Label>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Defina critérios que o agente deve usar para
                          qualificar ou desqualificar clientes durante a coleta.
                        </p>
                        <Textarea
                          value={phaseConfig.qualificationRules}
                          onChange={(e) =>
                            setPhaseConfig((prev) => ({
                              ...prev,
                              qualificationRules: e.target.value,
                            }))
                          }
                          placeholder='Ex: "Se o cliente mora fora do Brasil, informar que não atendemos casos internacionais. Se a dívida é inferior a R$ 5.000, orientar a procurar o Juizado Especial."'
                          className="text-xs min-h-[80px]"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Mensagem de desqualificação
                        </Label>
                        <Input
                          value={phaseConfig.disqualificationMessage}
                          onChange={(e) =>
                            setPhaseConfig((prev) => ({
                              ...prev,
                              disqualificationMessage: e.target.value,
                            }))
                          }
                          placeholder={DEFAULT_DISQUALIFICATION_MESSAGE}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Funcionalidades: aparecem apenas na fase final */}
                  {phaseKey === "finalization" && (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                      <div>
                        <Label className="text-sm font-semibold text-foreground">
                          Funcionalidades da Etapa Final
                        </Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Ative ou desative funcionalidades que o agente pode
                          oferecer ao encerrar o atendimento.
                        </p>
                      </div>
                      {(
                        Object.keys(FINALIZATION_FEATURES) as FinalizationFeatureId[]
                      ).map((featureId) => {
                        const feature = FINALIZATION_FEATURES[featureId];
                        return (
                          <div
                            key={featureId}
                            className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-3"
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="text-sm font-medium text-foreground">
                                {feature.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {feature.description}
                              </p>
                            </div>
                            <Switch
                              checked={
                                phaseConfig.finalizationFeatures[featureId]
                              }
                              onCheckedChange={() => toggleFeature(featureId)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Botoes */}
            <div className="flex items-center justify-center gap-4 py-4">
              <Button
                variant="outline"
                onClick={loadConfig}
                disabled={isLoading || isSaving}
              >
                Recarregar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !configRowId}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Configurações"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useWizard } from "react-use-wizard";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type AgentPhaseConfig,
  DEFAULT_PHASE_PROMPTS,
  DEFAULT_DISQUALIFICATION_MESSAGE,
  FINALIZATION_FEATURES,
  type FinalizationFeatureId,
} from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

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

export const StepAgentPhases = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep, previousStep } = useWizard();
  const isIncluded = data.includedSteps.agentPhases;
  const config = data.agentPhaseConfig;

  const updateConfig = (partial: Partial<AgentPhaseConfig>) => {
    updateSection({
      agentPhaseConfig: { ...config, ...partial },
    });
  };

  const updatePhasePrompt = (phase: PhaseKey, value: string) => {
    updateSection({
      agentPhaseConfig: {
        ...config,
        phases: {
          ...config.phases,
          [phase]: { customPrompt: value },
        },
      },
    });
  };

  const resetPhasePrompt = (phase: PhaseKey) => {
    updatePhasePrompt(phase, "");
  };

  const toggleFeature = (featureId: FinalizationFeatureId) => {
    updateSection({
      agentPhaseConfig: {
        ...config,
        finalizationFeatures: {
          ...config.finalizationFeatures,
          [featureId]: !config.finalizationFeatures[featureId],
        },
      },
    });
  };

  const handleSubmit = async () => {
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Fases do Agente</h3>
          <p className="text-sm text-muted-foreground">
            Personalize o comportamento do agente em cada etapa do atendimento
            e ative funcionalidades extras.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <Switch
            checked={isIncluded}
            onCheckedChange={(checked) => {
              updateSection({
                includedSteps: {
                  ...data.includedSteps,
                  agentPhases: checked,
                },
              });
            }}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isIncluded ? "Incluido" : "Excluido"}
          </span>
        </div>
      </div>

      {isIncluded ? (
        <div className="space-y-5">
          {(Object.keys(PHASE_META) as PhaseKey[]).map((phaseKey) => {
            const meta = PHASE_META[phaseKey];
            const currentPrompt = config.phases[phaseKey].customPrompt;

            return (
              <div
                key={phaseKey}
                className="rounded-lg border border-border/50 p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
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
                    className="text-xs min-h-[70px]"
                    rows={2}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Deixe vazio para usar o comportamento padrão.
                  </p>
                </div>

                {/* Qualificação: apenas na fase de perguntas */}
                {phaseKey === "questions" && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
                    <div>
                      <Label className="text-sm font-semibold text-foreground">
                        Regras de Qualificação
                      </Label>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Defina critérios que o agente deve usar para qualificar
                        ou desqualificar clientes durante a coleta.
                      </p>
                      <Textarea
                        value={config.qualificationRules}
                        onChange={(e) =>
                          updateConfig({ qualificationRules: e.target.value })
                        }
                        placeholder='Ex: "Se o cliente mora fora do Brasil, informar que não atendemos casos internacionais."'
                        className="text-xs min-h-[70px]"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Mensagem de desqualificação
                      </Label>
                      <Input
                        value={config.disqualificationMessage}
                        onChange={(e) =>
                          updateConfig({
                            disqualificationMessage: e.target.value,
                          })
                        }
                        placeholder={DEFAULT_DISQUALIFICATION_MESSAGE}
                        className="text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Funcionalidades: apenas na fase final */}
                {phaseKey === "finalization" && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
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
                      Object.keys(
                        FINALIZATION_FEATURES,
                      ) as FinalizationFeatureId[]
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
                            checked={config.finalizationFeatures[featureId]}
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

          <div className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={previousStep}>
              Voltar
            </Button>
            <Button type="button" onClick={handleSubmit}>
              Continuar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Etapa opcional desativada
          </p>
          <p>
            Ative o interruptor acima para personalizar as fases do agente.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={previousStep}>
              Voltar
            </Button>
            <Button type="button" onClick={nextStep}>
              Pular etapa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

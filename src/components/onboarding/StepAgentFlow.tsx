"use client";

import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizard } from "react-use-wizard";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { agentFlowSchema, type AgentFlow } from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

const MAX_DIRECTED_QUESTIONS = 5;

type LegacyDirectedQuestion = { prompt?: string; objective?: string };
type AgentFlowFormValues = AgentFlow & Record<string, any>;

const normalizeDirectedQuestions = (
  value: Array<string | LegacyDirectedQuestion>,
): string[] => {
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        return String(item.prompt ?? item.objective ?? "").trim();
      }
      return "";
    })
    .filter((question) => question.length > 0);
};

export const StepAgentFlow = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep, previousStep } = useWizard();
  const isIncluded = data.includedSteps.agentFlow;

  const form = useForm<AgentFlowFormValues>({
    resolver: zodResolver(agentFlowSchema),
    defaultValues: {
      ...data.agentFlow,
      directedQuestions: normalizeDirectedQuestions(
        data.agentFlow.directedQuestions as Array<string | LegacyDirectedQuestion>,
      ),
    },
  });

  const directedQuestionsArray = useFieldArray<AgentFlowFormValues, "directedQuestions">({
    name: "directedQuestions",
    control: form.control,
  });
  const canAddMoreQuestions =
    directedQuestionsArray.fields.length < MAX_DIRECTED_QUESTIONS;

  const handleAddQuestion = () => {
    directedQuestionsArray.append("");
  };

  useEffect(() => {
    form.reset({
      ...data.agentFlow,
      directedQuestions: normalizeDirectedQuestions(
        data.agentFlow.directedQuestions as Array<string | LegacyDirectedQuestion>,
      ),
    });
  }, [data.agentFlow, form]);

  const onSubmit = async (values: AgentFlowFormValues) => {
    const normalized: AgentFlow = {
      briefingScope: values.briefingScope,
      directedQuestions: normalizeDirectedQuestions(
        values.directedQuestions as Array<string | LegacyDirectedQuestion>,
      ),
      maxQuestions: values.maxQuestions,
      institutionalAdditionalInfo: values.institutionalAdditionalInfo,
    };
    updateSection({ agentFlow: normalized });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Briefing juridico estruturado</h3>
          <p className="text-sm text-muted-foreground">
            Defina o escopo, o limite de perguntas e as informacoes que sustentam o novo prompt juridico.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <Switch
            checked={data.includedSteps.agentFlow}
            onCheckedChange={(checked) => {
              updateSection({
                includedSteps: {
                  ...data.includedSteps,
                  agentFlow: checked,
                },
              });
            }}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {data.includedSteps.agentFlow ? "Incluido" : "Excluido"}
          </span>
        </div>
      </div>

      {isIncluded ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="briefingScope"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Escopo do briefing</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Resuma o que deve ser coletado antes da analise humana"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxQuestions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite maximo de perguntas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const rawValue = event.target.value;
                          field.onChange(
                            rawValue === "" ? undefined : Number(rawValue),
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      O assistente encerra a etapa direcionada ao atingir esse limite.
                    </p>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Perguntas direcionadas</p>
                  <p className="text-xs text-muted-foreground">
                    Configure perguntas especificas para o briefing. Se a lista ficar vazia, o agente gera perguntas automaticamente com base no nicho configurado.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAddQuestion}
                  disabled={!canAddMoreQuestions}
                >
                  Adicionar pergunta
                </Button>
              </div>

              {directedQuestionsArray.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma pergunta configurada. O assistente segue o nicho descrito no perfil do agente.
                </p>
              ) : (
                <div className="space-y-4">
                  {directedQuestionsArray.fields.map((field, index) => (
                    <div key={field.id} className="space-y-3 rounded-md border border-border/40 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Pergunta {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => directedQuestionsArray.remove(index)}
                        >
                          Remover
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name={`directedQuestions.${index}`}
                        render={({ field: questionField }) => (
                          <FormItem>
                            <FormLabel>Texto da pergunta</FormLabel>
                            <FormControl>
                              <Textarea
                                rows={3}
                                placeholder="Ex.: Qual foi a decisao administrativa mais recente?"
                                {...questionField}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="institutionalAdditionalInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Informacões institucionais adicionais</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Diferenciais, prazos de resposta ou avisos que podem ser enviados quando o cliente solicitar dados do escritório."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <StepActions
              submitLabel="Continuar"
              isSubmitting={form.formState.isSubmitting}
            />
          </form>
        </Form>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Etapa opcional desativada</p>
          <p>Ative o interruptor acima para personalizar esta parte quando quiser.</p>
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

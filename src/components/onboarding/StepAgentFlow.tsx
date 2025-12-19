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
import {
  agentFlowSchema,
  commitmentTypes,
  type AgentFlow,
} from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

export const StepAgentFlow = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep } = useWizard();

  const form = useForm<AgentFlow>({
    resolver: zodResolver(agentFlowSchema),
    defaultValues: data.agentFlow,
  });

  const viabilityArray = useFieldArray({
    name: "viabilityQuestions",
    control: form.control,
  });

  const documents = form.watch("documentsChecklist");

  const handleAddDocument = () => {
    const currentDocs = form.getValues("documentsChecklist");
    form.setValue("documentsChecklist", [...currentDocs, ""]);
  };

  const handleRemoveDocument = (index: number) => {
    const currentDocs = form.getValues("documentsChecklist");
    if (currentDocs.length <= 1) {
      return;
    }
    form.setValue(
      "documentsChecklist",
      currentDocs.filter((_, docIndex) => docIndex !== index),
    );
  };

  useEffect(() => {
    form.reset(data.agentFlow);
  }, [data.agentFlow, form]);

  const onSubmit = async (values: AgentFlow) => {
    updateSection({ agentFlow: values });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Fluxo de atendimento</h3>
          <p className="text-sm text-muted-foreground">
            Monte o roteiro que o agente vai seguir na conversa com o seu cliente — do primeiro oi ao encerramento. Isso ajuda o assistente a agir exatamente como você faria.
          </p>
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
            {data.includedSteps.agentFlow ? "Incluído" : "Excluído"}
          </span>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="greetingsScript"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Mensagem de recepção</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Ex.: Olá! Somos especialistas..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="companyOfferings"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Produtos e nichos atendidos</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Liste rapidamente os serviços ofertados" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="qualificationPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pergunta de qualificação</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Posso fazer a análise gratuita agora mesmo?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="qualificationFallback"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resposta quando o lead não quer seguir</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Sem problemas, mantenho o canal aberto..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Perguntas de viabilidade</p>
                <p className="text-xs text-muted-foreground">
                  Liste as perguntas essenciais que você faz para entender se o caso é viável e explique rapidamente por que cada pergunta é importante.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  viabilityArray.append({
                    prompt: "",
                    objective: "",
                  })
                }
              >
                Adicionar pergunta
              </Button>
            </div>

            {viabilityArray.fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-border/40 p-3 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Pergunta {index + 1}</span>
                  {viabilityArray.fields.length > 2 ? (
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() => viabilityArray.remove(index)}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>

                <FormField
                  control={form.control}
                  name={`viabilityQuestions.${index}.prompt`}
                  render={({ field: promptField }) => (
                    <FormItem>
                      <FormLabel>Pergunta</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Qual é o percentual do salário comprometido?" {...promptField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`viabilityQuestions.${index}.objective`}
                  render={({ field: objectiveField }) => (
                    <FormItem>
                      <FormLabel>Objetivo</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Descobrir se ultrapassa o limite legal..." {...objectiveField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </div>

          <FormField
            control={form.control}
            name="disqualificationRules"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Regras de desqualificação</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Explique quando encerrar o atendimento e como comunicar" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="commitmentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de compromisso</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {commitmentTypes.map((type) => (
                        <option key={type} value={type}>
                          {type === "contrato" ? "Assinatura de contrato" : "Agendamento com advogado"}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commitmentScript"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Mensagem para assinatura/agendamento</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Descrição do próximo passo após a aprovação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Checklist de documentos</p>
                <p className="text-xs text-muted-foreground">
                  Liste apenas o que você realmente exige para dar continuidade ao caso.
                </p>
              </div>

              <Button type="button" size="sm" variant="secondary" onClick={handleAddDocument}>
                Adicionar documento
              </Button>
            </div>

            {(documents ?? []).map((_, index) => (
              <div key={`doc-${index}`} className="flex items-center gap-3">
                <FormField
                  control={form.control}
                  name={`documentsChecklist.${index}`}
                  render={({ field: docField }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input placeholder="Comprovante de residência..." {...docField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(documents?.length ?? 0) > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDocument(index)}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

  <div className="grid gap-4">
          <FormField
            control={form.control}
            name="documentConfirmationMessage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mensagem de confirmação de documentos</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Confirmo cada arquivo assim que receber..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closingMessage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mensagem de encerramento</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Recapitulação final mantendo o canal aberto" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="followUpRules"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Regras de follow-up</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Quando enviar atualizações e como transferir ao advogado" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          </div>

          <StepActions
            submitLabel="Continuar"
            isSubmitting={form.formState.isSubmitting}
          />
        </form>
      </Form>
    </div>
  );
};

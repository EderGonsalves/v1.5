"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  agentFormValuesFromPersonality,
  agentPersonalityFormSchema,
  agentPersonalityFromFormValues,
  type AgentPersonalityFormValues,
} from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

export const StepAgentTone = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep, previousStep } = useWizard();
  const isIncluded = data.includedSteps.agentPersonality;

  const form = useForm<AgentPersonalityFormValues>({
    resolver: zodResolver(agentPersonalityFormSchema),
    defaultValues: agentFormValuesFromPersonality(data.agentPersonality),
  });

  useEffect(() => {
    form.reset(agentFormValuesFromPersonality(data.agentPersonality));
  }, [data.agentPersonality, form]);

  const onSubmit = async (values: AgentPersonalityFormValues) => {
    updateSection({
      agentPersonality: agentPersonalityFromFormValues(values),
    });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Tom de voz e mensagens-chave</h3>
          <p className="text-sm text-muted-foreground">
            Escreva como o agente deve iniciar e encerrar as conversas e quais palavras prefere evitar. Essas mensagens serão usadas literalmente com os seus clientes.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <Switch
            checked={data.includedSteps.agentPersonality}
            onCheckedChange={(checked) => {
              updateSection({
                includedSteps: {
                  ...data.includedSteps,
                  agentPersonality: checked,
                },
              });
            }}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {data.includedSteps.agentPersonality ? "Incluído" : "Excluído"}
          </span>
        </div>
      </div>

      {isIncluded ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="greeting"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Saudação inicial</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Mensagem enviada quando o atendimento começar"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closing"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frase de despedida</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Mensagem enviada ao encerrar o atendimento"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="forbiddenWords"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Palavras proibidas</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Separe por vírgula (ex.: atraso, cancelamento, desconto...)"
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
          <p>Ative o interruptor acima para definir o tom de voz e as mensagens-chave quando quiser.</p>
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

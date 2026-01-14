"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizard } from "react-use-wizard";

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
import {
  agentLanguages,
  agentProfileSchema,
  type AgentProfile,
} from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const StepAgentProfile = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep } = useWizard();

  const form = useForm<AgentProfile>({
    resolver: zodResolver(agentProfileSchema),
    defaultValues: data.agentProfile,
  });

  useEffect(() => {
    form.reset(data.agentProfile);
  }, [data.agentProfile, form]);

  const onSubmit = async (values: AgentProfile) => {
    updateSection({ agentProfile: values });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Quem fala com o seu cliente</h3>
        <p className="text-sm text-muted-foreground">
          Descreva o agente que vai conduzir o atendimento para que possamos usar o mesmo tom, idioma e repertório em todas as conversas.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="agentName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do agente</FormLabel>
                <FormControl>
                  <Input placeholder="Assistente RIA" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Idioma principal</FormLabel>
                <FormControl>
                  <select {...field} className={selectClassName}>
                    {agentLanguages.map((language) => (
                      <option key={language} value={language}>
                        {language}
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
            name="personalityDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição da personalidade</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Você é uma especialista digital que guia o cliente com empatia e objetividade."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expertiseArea"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Área de expertise</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Direito previdenciário com foco em BPC/LOAS, revisões e análise documental."
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
    </div>
  );
};

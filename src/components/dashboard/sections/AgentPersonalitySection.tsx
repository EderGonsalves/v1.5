"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import {
  agentPersonalityFormSchema,
  agentPersonalityFromFormValues,
  agentFormValuesFromPersonality,
  type AgentPersonality,
  type AgentPersonalityFormValues,
} from "@/lib/validations";

type AgentPersonalitySectionProps = {
  data: AgentPersonality;
  onChange: (data: AgentPersonality) => void;
};

export const AgentPersonalitySection = ({
  data,
  onChange,
}: AgentPersonalitySectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<AgentPersonalityFormValues>({
    resolver: zodResolver(agentPersonalityFormSchema),
    defaultValues: agentFormValuesFromPersonality(data),
  });

  const handleSave = (values: AgentPersonalityFormValues) => {
    onChange(agentPersonalityFromFormValues(values));
    setIsEditing(false);
  };

  const handleCancel = () => {
    form.reset(agentFormValuesFromPersonality(data));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Personalidade do Agente</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Salvar
              </Button>
            </div>
          </div>

          <FormField
            control={form.control}
            name="greeting"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Saudação inicial</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
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
                  <Textarea rows={2} {...field} />
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
                <FormLabel>Palavras proibidas (separadas por vírgula)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Personalidade do Agente</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Editar
        </Button>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Saudação:</span> {data.greeting || "-"}
        </p>
        <p>
          <span className="font-medium">Despedida:</span> {data.closing || "-"}
        </p>
        <p>
          <span className="font-medium">Palavras proibidas:</span>{" "}
          {data.forbiddenWords.length > 0
            ? data.forbiddenWords.join(", ")
            : "-"}
        </p>
      </div>
    </div>
  );
};


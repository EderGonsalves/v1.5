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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  agentLanguages,
  agentProfileSchema,
  type AgentProfile,
} from "@/lib/validations";

type AgentProfileSectionProps = {
  data: AgentProfile;
  onChange: (data: AgentProfile) => void;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const AgentProfileSection = ({
  data,
  onChange,
}: AgentProfileSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<AgentProfile>({
    resolver: zodResolver(agentProfileSchema),
    defaultValues: data,
  });

  const handleSave = (values: AgentProfile) => {
    onChange(values);
    setIsEditing(false);
  };

  const handleCancel = () => {
    form.reset(data);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Perfil do Agente</h3>
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
            name="agentName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do agente</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                  <Textarea rows={4} {...field} />
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
                  <Textarea rows={3} {...field} />
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
        <h3 className="text-lg font-semibold">Perfil do Agente</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Editar
        </Button>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Nome:</span> {data.agentName || "-"}
        </p>
        <p>
          <span className="font-medium">Idioma:</span> {data.language || "-"}
        </p>
        <p>
          <span className="font-medium">Personalidade:</span>{" "}
          {data.personalityDescription || "-"}
        </p>
        <p>
          <span className="font-medium">Expertise:</span>{" "}
          {data.expertiseArea || "-"}
        </p>
      </div>
    </div>
  );
};









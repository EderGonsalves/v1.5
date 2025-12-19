"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Check, X } from "lucide-react";

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
import { companyInfoSchema, type CompanyInfo } from "@/lib/validations";

type CompanyInfoSectionProps = {
  data: CompanyInfo;
  onChange: (data: CompanyInfo) => void;
};

export const CompanyInfoSection = ({
  data,
  onChange,
}: CompanyInfoSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<CompanyInfo>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: data,
  });

  const handleSave = (values: CompanyInfo) => {
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
            <h3 className="text-lg font-semibold">Informações da Empresa</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                <Check className="h-4 w-4" />
                Salvar
              </Button>
            </div>
          </div>

          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do escritório</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="businessHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Horários de atendimento</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de telefone conectado à API</FormLabel>
                <FormControl>
                  <Input placeholder="+5511999999999" {...field} />
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
        <h3 className="text-lg font-semibold">Informações da Empresa</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Nome:</span> {data.companyName || "-"}
        </p>
        <p>
          <span className="font-medium">Horários:</span>{" "}
          {data.businessHours || "-"}
        </p>
        <p>
          <span className="font-medium">Telefone conectado à API:</span>{" "}
          {data.phoneNumber || "-"}
        </p>
      </div>
    </div>
  );
};









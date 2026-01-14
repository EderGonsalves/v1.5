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
import { companyInfoSchema, type CompanyInfo } from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

export const StepCompanyInfo = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep } = useWizard();

  const form = useForm<CompanyInfo>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: {
      ...data.companyInfo,
      wabaPhoneNumber:
        data.companyInfo.wabaPhoneNumber || data.companyInfo.phoneNumber || "",
    },
  });

  useEffect(() => {
    form.reset({
      ...data.companyInfo,
      wabaPhoneNumber:
        data.companyInfo.wabaPhoneNumber || data.companyInfo.phoneNumber || "",
    });
  }, [data.companyInfo, form]);

  const onSubmit = async (values: CompanyInfo) => {
    const normalizedValues = {
      ...values,
      phoneNumber: values.wabaPhoneNumber,
    };
    updateSection({ companyInfo: normalizedValues });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Sobre a sua empresa</h3>
        <p className="text-sm text-muted-foreground">
          Conte como o seu escritório ou negócio se apresenta para que possamos criar a experiência certa nas próximas etapas.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do escritório</FormLabel>
                <FormControl>
                  <Input placeholder="Nome do escritório" {...field} />
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
                  <Input placeholder="Seg a Sex - 8h as 18h" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="wabaPhoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número do WhatsApp conectado a Meta</FormLabel>
                <FormControl>
                  <Input placeholder="+5511999999999" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <StepActions
            submitLabel="Continuar"
            isSubmitting={form.formState.isSubmitting}
            showBack={false}
          />
        </form>
      </Form>
    </div>
  );
};

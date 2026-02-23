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
import { addressSchema, type AddressInfo } from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

export const StepAddress = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep } = useWizard();

  const form = useForm<AddressInfo>({
    resolver: zodResolver(addressSchema),
    defaultValues: data.address,
  });

  useEffect(() => {
    form.reset(data.address);
  }, [data.address, form]);

  const onSubmit = async (values: AddressInfo) => {
    updateSection({ address: values });
    await nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Endereço completo</h3>
        <p className="text-sm text-muted-foreground">
          Compartilhe o endereço oficial para personalizarmos mensagens, documentos e assinaturas enviadas aos seus clientes.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="fullAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endereço completo</FormLabel>
                <FormControl>
                  <Input placeholder="Av. Paulista, 1000 - São Paulo/SP - CEP 01310-100" {...field} />
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

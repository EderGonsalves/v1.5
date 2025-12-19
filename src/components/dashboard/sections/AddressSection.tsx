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
import { addressSchema, type AddressInfo } from "@/lib/validations";

type AddressSectionProps = {
  data: AddressInfo;
  onChange: (data: AddressInfo) => void;
};

export const AddressSection = ({ data, onChange }: AddressSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<AddressInfo>({
    resolver: zodResolver(addressSchema),
    defaultValues: data,
  });

  const handleSave = (values: AddressInfo) => {
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
            <h3 className="text-lg font-semibold">Endereço</h3>
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
            name="street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rua</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Endereço</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Rua:</span> {data.street || "-"}
        </p>
        <p>
          <span className="font-medium">Cidade:</span> {data.city || "-"} /{" "}
          {data.state || "-"}
        </p>
        <p>
          <span className="font-medium">CEP:</span> {data.zipCode || "-"}
        </p>
      </div>
    </div>
  );
};









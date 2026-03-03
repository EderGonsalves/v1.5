"use client";

import { useState, type ReactNode } from "react";
import { useWizard } from "react-use-wizard";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buildBaserowRowFromPayload } from "@/lib/baserow";
import { buildOnboardingPayload, type OnboardingPayload } from "@/lib/validations";
import { createBaserowConfig, getBaserowConfigs, submitOnboarding, updateBaserowConfig } from "@/services/api";

import { useOnboarding } from "./onboarding-context";

export const StepConfirmation = () => {
  const { data, reset } = useOnboarding();
  const { previousStep, goToStep, nextStep } = useWizard();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const syncBaserowConfig = async (payload: OnboardingPayload) => {
    if (!data.auth?.institutionId) {
      console.warn("Nao foi possivel sincronizar com o Baserow: institutionId ausente");
      return;
    }

    const baserowPayload = buildBaserowRowFromPayload(payload);
    const baserowRows = await getBaserowConfigs(data.auth.institutionId);
    if (baserowRows.length === 0) {
      await createBaserowConfig(baserowPayload);
      return;
    }

    const latestRow = baserowRows.reduce(
      (current, candidate) => (candidate.id > current.id ? candidate : current),
      baserowRows[0],
    );

    await updateBaserowConfig(latestRow.id, baserowPayload);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      console.log("Enviando dados do onboarding:", data);
      const payload = buildOnboardingPayload(data);
      console.log("Payload construído:", payload);
      const response = await submitOnboarding(payload);
      console.log("Resposta do servidor:", response.data);
      console.log("Sincronizando configurações no Baserow...");
      await syncBaserowConfig(payload);
      setStatus("success");
      
      // Avançar para a próxima etapa (Conexões) após 2 segundos
      setTimeout(async () => {
        await nextStep();
      }, 2000);
    } catch (error) {
      console.error("Erro ao enviar onboarding:", error);
      setStatus("error");
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else if (typeof error === "object" && error !== null && "response" in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setErrorMessage(
          axiosError.response?.data?.message || "Nǜo foi poss��vel registrar o onboarding"
        );
      } else {
        setErrorMessage("Nǜo foi poss��vel registrar o onboarding");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    reset();
    goToStep(0);
    setStatus("idle");
    setErrorMessage("");
  };

  const sections: Array<{ key: string; content: ReactNode }> = [
    {
      key: "company",
      content: (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Empresa</h4>
          <p className="text-sm text-muted-foreground">
            WhatsApp: <span className="font-medium text-foreground">{data.companyInfo.wabaPhoneNumber || "-"}</span>
          </p>
          <p className="text-base font-medium">{data.companyInfo.companyName || "-"}</p>
          <p className="text-sm text-muted-foreground">
            Atendimento: {data.companyInfo.businessHours || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "address",
      content: (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Endereço</h4>
          <p className="text-sm">{data.address.fullAddress || "-"}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revise e finalize</h3>
        <p className="text-sm text-muted-foreground">
          Verifique se as informações estão corretas antes de enviar tudo ao seu fluxo automatizado.
        </p>
      </div>

            <div className="rounded-lg border border-border/60 p-4">
        {sections.map(({ key, content }, index) => (
          <div key={key}>
            {index > 0 && <Separator className="my-4" />}
            {content}
          </div>
        ))}
      </div>
      {status === "success" ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Tudo certo! Compartilhamos o fluxo configurado e os arquivos de apoio com a sua automação e avisamos o worker de RAG.
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Houve uma falha ao comunicar com o backend. {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={previousStep}
          disabled={isSubmitting}
        >
          Voltar e editar
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          {status === "success" ? (
            <Button type="button" variant="secondary" onClick={handleRestart}>
              Novo onboarding
            </Button>
          ) : null}

          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Finalizar cadastro"}
          </Button>
        </div>
      </div>
    </div>
  );
};

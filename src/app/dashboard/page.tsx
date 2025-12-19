"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getConfig, updateConfig } from "@/services/api";
import { buildOnboardingPayload, type OnboardingData } from "@/lib/validations";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

const LoadingState = ({ message }: { message: string }) => (
  <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  </main>
);

const DashboardPageContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const institutionIdParam = searchParams.get("institutionId");
  const [institutionId, setInstitutionId] = useState<number | null>(null);
  const [config, setConfig] = useState<OnboardingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const id = institutionIdParam
      ? Number.parseInt(institutionIdParam, 10)
      : null;

    if (!id || Number.isNaN(id)) {
      setError("ID da instituição inválido");
      setIsLoading(false);
      return;
    }

    setInstitutionId(id);
    loadConfig(id);
  }, [institutionIdParam]);

  const loadConfig = async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      console.log("Carregando configuração para institutionId:", id);
      const data = await getConfig(id);
      
      if (!data) {
        setError("Configuração não encontrada. Por favor, complete o onboarding primeiro.");
        setIsLoading(false);
        return;
      }

      // Converter o payload retornado para OnboardingData
      const onboardingData: OnboardingData = {
        companyInfo: {
          companyName: data.tenant?.companyName || "",
          businessHours: data.tenant?.businessHours || "",
          phoneNumber: data.tenant?.phoneNumber || "",
        },
        address: data.tenant?.address || {
          street: "",
          city: "",
          state: "",
          zipCode: "",
        },
        agentProfile: data.agentSettings?.profile || {
          agentName: "",
          language: "Português (Brasil)",
          personalityDescription: "",
          expertiseArea: "",
        },
        agentStages: data.agentSettings?.stages || [],
        agentPersonality: data.agentSettings?.personality || {
          greeting: "",
          closing: "",
          forbiddenWords: [],
        },
        agentFlow: data.agentSettings?.flow || {
          greetingsScript: "",
          companyOfferings: "",
          qualificationPrompt: "",
          qualificationFallback: "",
          viabilityQuestions: [],
          disqualificationRules: "",
          commitmentType: "contrato",
          commitmentScript: "",
          documentsChecklist: [],
          documentConfirmationMessage: "",
          closingMessage: "",
          followUpRules: "",
          skippableStages: [],
        },
        ragFiles: data.ragFiles || [],
        connections: data.connections,
        auth: {
          institutionId: id,
        },
        includedSteps: data.includedSteps || {
          companyInfo: true,
          address: true,
          agentProfile: true,
          agentFlow: true,
          agentPersonality: true,
          ragUpload: true,
        },
      };

      setConfig(onboardingData);
    } catch (err) {
      console.error("Erro ao carregar configuração:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar configuração",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (updatedConfig: OnboardingData) => {
    if (!institutionId) return;

    try {
      setIsSaving(true);
      setError(null);
      console.log("Salvando configuração:", updatedConfig);
      const payload = buildOnboardingPayload(updatedConfig);
      await updateConfig(institutionId, payload);
      setConfig(updatedConfig);
      console.log("Configuração salva com sucesso");
    } catch (err) {
      console.error("Erro ao salvar configuração:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao salvar configuração",
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToOnboarding = () => {
    router.push("/");
  };

  if (isLoading) {
    return <LoadingState message="Carregando configura????es..." />;
  }

  if (error && !config) {
    return (
      <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Erro</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleBackToOnboarding}>
                Voltar para Onboarding
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Dashboard de Configurações
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Gerencie suas configurações
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Visualize e edite todas as personalizações do seu agente e fluxo de atendimento.
          </p>
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Configurações do Agente</CardTitle>
                <CardDescription>
                  Instituição #{institutionId}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={handleBackToOnboarding}>
                Novo Onboarding
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}
            <DashboardContent
              config={config}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingState message="Preparando dashboard..." />}>
      <DashboardPageContent />
    </Suspense>
  );
}

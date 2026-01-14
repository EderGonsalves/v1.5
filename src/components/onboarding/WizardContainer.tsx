"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Wizard, useWizard } from "react-use-wizard";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getBaserowConfigs } from "@/services/api";
import { cn } from "@/lib/utils";
import {
  defaultAgentFlow,
  defaultAgentPersonality,
  type OnboardingData,
} from "@/lib/validations";

import { StepAddress } from "./StepAddress";
import { StepAgentFlow } from "./StepAgentFlow";
import { StepAgentProfile } from "./StepAgentProfile";
import { StepAgentTone } from "./StepAgentTone";
import { StepCompanyInfo } from "./StepCompanyInfo";
import { StepConfirmation } from "./StepConfirmation";
import { StepConnections } from "./StepConnections";
import { StepRagUpload } from "./StepRagUpload";
import { OnboardingLogin } from "./OnboardingLogin";
import { useOnboarding } from "./onboarding-context";

type ConfigurationMode = "simple" | "advanced";
type WizardStepEntry = {
  key: string;
  Component: ComponentType;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const WizardProgressHeader = () => {
  const { activeStep, stepCount } = useWizard();
  const progress = Math.round(((activeStep + 1) / stepCount) * 100);

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border/70 bg-muted/50 p-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Etapa {activeStep + 1} de {stepCount}
        </span>
        <span>{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
};

const WizardFooterNote = () => (
  <p className="text-center text-xs text-muted-foreground">
    Todos os dados ficam no estado do wizard ate a ultima etapa, quando
    encaminhamos tudo para o seu fluxo automatizado (e para o worker de RAG, se
    configurado).
  </p>
);

const WizardContent = () => {
  const { data, logout, updateSection } = useOnboarding();
  const router = useRouter();
  const configurationOptions: Array<{
    id: ConfigurationMode;
    title: string;
    description: string;
    helper: string;
  }> = [
    {
      id: "simple",
      title: "Configuracao simples",
      description:
        "Foque nos dados obrigatórios (empresa, endereço e perfil do agente) e finalize mais rápido.",
      helper: "Ideal para ativar a operação rapidamente.",
    },
    {
      id: "advanced",
      title: "Configuracao avancada",
      description:
        "Libere todas as personalizações de fluxo, tom e base de conhecimento para um agente completo.",
      helper: "Ative quando quiser ajustar o bot em todos os detalhes.",
    },
  ];

  const baseSteps: WizardStepEntry[] = [
    { key: "company", Component: StepCompanyInfo },
    { key: "address", Component: StepAddress },
    { key: "agentProfile", Component: StepAgentProfile },
  ];

  const advancedOnlySteps: WizardStepEntry[] = [
    { key: "agentFlow", Component: StepAgentFlow },
    { key: "agentTone", Component: StepAgentTone },
    { key: "ragUpload", Component: StepRagUpload },
  ];

  const finalSteps: WizardStepEntry[] = [
    { key: "confirmation", Component: StepConfirmation },
    { key: "connections", Component: StepConnections },
  ];

  const wizardSteps: WizardStepEntry[] =
    data.configurationMode === "advanced"
      ? [...baseSteps, ...advancedOnlySteps, ...finalSteps]
      : [...baseSteps, ...finalSteps];

  const handleModeChange = (mode: ConfigurationMode) => {
    const enableOptional = mode === "advanced";
    const nextUpdate: Partial<OnboardingData> = {
      configurationMode: mode,
      includedSteps: {
        ...data.includedSteps,
        companyInfo: true,
        address: true,
        agentProfile: true,
        agentFlow: enableOptional,
        agentPersonality: enableOptional,
        ragUpload: enableOptional,
      },
    };

    if (!enableOptional) {
      nextUpdate.agentFlow = clone(defaultAgentFlow);
      nextUpdate.agentPersonality = clone(defaultAgentPersonality);
      nextUpdate.ragFiles = [];
    }

    updateSection(nextUpdate);
  };

  useEffect(() => {
    // Verificar se já existe configuração quando o componente carrega
    const checkExistingConfig = async () => {
      if (!data.auth?.institutionId) return;

      try {
        const baserowConfigs = await getBaserowConfigs(data.auth.institutionId);
        if (baserowConfigs && baserowConfigs.length > 0) {
          // Já existe configuração, redirecionar para página de configurações
          console.log("Configuração já existe no Baserow, redirecionando para página de configurações");
          router.push("/configuracoes");
        }
      } catch (error) {
        // Se houver erro, continuar normalmente (pode ser que não exista configuração ainda)
        console.error("Falha ao verificar configurações existentes", error);
      }
    };

    if (data.auth) {
      checkExistingConfig();
    }
  }, [data.auth, router]);

  if (!data.auth) {
    return (
      <div className="w-full">
        <OnboardingLogin />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-primary/40 bg-primary/5 p-4 text-sm text-primary">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Acesso validado</p>
            <p className="text-xs text-primary/80">
              Instituicao conectada #{data.auth.institutionId}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={logout}
          >
            Trocar login
          </Button>
        </div>
      </div>

      <section className="space-y-4 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Escolha o modo de configuração
          </p>
          <h3 className="text-base font-semibold text-foreground">
            Como você prefere montar o agente?
          </h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {configurationOptions.map((option) => {
            const isActive = data.configurationMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleModeChange(option.id)}
                className={cn(
                  "rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/50",
                )}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {option.title}
                  </span>
                  {isActive ? (
                    <span className="text-xs font-medium text-primary">
                      Selecionado
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {option.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {option.helper}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <Wizard header={<WizardProgressHeader />} footer={<WizardFooterNote />}>
        {wizardSteps.map(({ key, Component }) => (
          <Component key={key} />
        ))}
      </Wizard>
    </div>
  );
};

export const WizardContainer = () => {
  const { data } = useOnboarding();

  // Se não houver auth, renderizar login em tela cheia
  if (!data.auth) {
    return <WizardContent />;
  }

  return (
    <Card className="mx-auto w-full max-w-4xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          Configuração do atendimento
        </CardTitle>
        <CardDescription>
          Preencha os dados da empresa, personalize o agente e defina o passo
          a passo que ele deve seguir com seus clientes.
        </CardDescription>
        <Separator className="mt-4" />
      </CardHeader>
      <CardContent className="space-y-6">
        <WizardContent />
      </CardContent>
    </Card>
  );
};

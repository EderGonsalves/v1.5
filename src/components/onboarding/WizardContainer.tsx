"use client";

import { useEffect } from "react";
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

import { StepAddress } from "./StepAddress";
import { StepAgentFlow } from "./StepAgentFlow";
import { StepAgentProfile } from "./StepAgentProfile";
import { StepAgentTone } from "./StepAgentTone";
import { StepCompanyInfo } from "./StepCompanyInfo";
import { StepConfirmation } from "./StepConfirmation";
import { StepConnections } from "./StepConnections";
import { StepRagUpload } from "./StepRagUpload";
import { OnboardingLogin } from "./OnboardingLogin";
import { OnboardingProvider, useOnboarding } from "./onboarding-context";

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
  const { data, logout } = useOnboarding();
  const router = useRouter();

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
        console.log("Verificando configurações existentes...");
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

      <Wizard header={<WizardProgressHeader />} footer={<WizardFooterNote />}>
        <StepCompanyInfo />
        <StepAddress />
        <StepAgentProfile />
        <StepAgentFlow />
        <StepAgentTone />
        <StepRagUpload />
        <StepConfirmation />
        <StepConnections />
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
          Configuracao do atendimento
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

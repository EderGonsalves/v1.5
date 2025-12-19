"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WizardContainer } from "@/components/onboarding/WizardContainer";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { getBaserowConfigs } from "@/services/api";

const HomeContent = () => {
  const router = useRouter();
  const { data } = useOnboarding();

  useEffect(() => {
    // Verificar se já existe configuração quando a página carrega
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

  return (
    <main className={data.auth ? "min-h-screen bg-white py-8 dark:bg-zinc-900" : "min-h-screen"}>
      {data.auth ? (
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
          <section className="space-y-3 text-center sm:text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Onboarding multi-etapas
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
              Configure o atendimento do seu escritório em poucos passos.
            </h1>
            <p className="text-base text-zinc-600 dark:text-zinc-300">
              Preencha as informações sobre a empresa, o agente e o fluxo de conversa; ao final, tudo é encaminhado automaticamente para o seu fluxo de automação.
            </p>
          </section>

          <WizardContainer />
        </div>
      ) : (
        <WizardContainer />
      )}
    </main>
  );
};

export default function Home() {
  return <HomeContent />;
}

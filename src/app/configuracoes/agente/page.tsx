"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  getBaserowConfigs,
  updateBaserowConfig,
} from "@/services/api";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { InstructionList } from "@/components/agent-config/InstructionList";
import {
  type InstructionType,
  INSTRUCTION_DEFINITIONS,
  readActiveInstructions,
  buildInstructionFields,
} from "@/lib/agent-instructions";

type PhoneOption = {
  configId: number;
  phoneNumber: string;
};

function AgentConfigContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isHydrated } = useOnboarding();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [configRowId, setConfigRowId] = useState<number | null>(null);
  const [instructions, setInstructions] = useState<
    Map<InstructionType, unknown>
  >(new Map());
  const [phoneOptions, setPhoneOptions] = useState<PhoneOption[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const configIdParam = searchParams.get("configId");

  const loadConfig = useCallback(async () => {
    if (!data.auth) return;
    setIsLoading(true);
    setError(null);
    try {
      const configs = await getBaserowConfigs(data.auth.institutionId);
      if (configs.length === 0) {
        setIsLoading(false);
        return;
      }

      // Extrair números disponíveis
      const phones: PhoneOption[] = [];
      const seenPhones = new Set<string>();
      for (const config of configs) {
        const record = config as Record<string, unknown>;
        const phone = String(record.waba_phone_number ?? "").trim();
        if (phone && !seenPhones.has(phone)) {
          seenPhones.add(phone);
          phones.push({ configId: config.id, phoneNumber: phone });
        }
      }
      setPhoneOptions(phones);

      // Determinar qual config carregar
      let targetConfig;
      if (configIdParam) {
        // configId vindo da query string → carregar essa config específica
        targetConfig = configs.find((c) => c.id === Number(configIdParam));
        if (!targetConfig) {
          setError(`Configuração #${configIdParam} não encontrada`);
          setIsLoading(false);
          return;
        }
      } else if (phones.length === 1) {
        // Único número → carregar direto
        targetConfig = configs.find((c) => c.id === phones[0].configId);
      } else if (phones.length > 1) {
        // Múltiplos números sem configId → aguardar seleção do usuário
        setIsLoading(false);
        return;
      } else {
        // Nenhum número → fallback para config mais recente
        targetConfig = configs.reduce(
          (cur, cand) => (cand.id > cur.id ? cand : cur),
          configs[0],
        );
      }

      if (targetConfig) {
        setConfigRowId(targetConfig.id);
        const record = targetConfig as Record<string, unknown>;
        const phone = String(record.waba_phone_number ?? "").trim();
        setSelectedPhone(phone || null);
        setInstructions(readActiveInstructions(record));
      }
    } catch (err) {
      console.error("Erro ao carregar configuração do agente:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar configuração",
      );
    } finally {
      setIsLoading(false);
    }
  }, [data.auth, configIdParam]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth, configIdParam]);

  const handleSelectPhone = (configId: number) => {
    router.push(`/configuracoes/agente?configId=${configId}`);
  };

  const handleChange = (type: InstructionType, value: unknown) => {
    setInstructions((prev) => {
      const next = new Map(prev);
      next.set(type, value);
      return next;
    });
  };

  const handleAdd = (type: InstructionType) => {
    setInstructions((prev) => {
      const next = new Map(prev);
      const def = INSTRUCTION_DEFINITIONS[type];
      let defaultValue: unknown = "";
      if (def.fieldType === "number") defaultValue = 5;
      if (def.fieldType === "list") defaultValue = [""];
      if (def.fieldType === "toggle") defaultValue = { enabled: false, instructions: "" };
      next.set(type, defaultValue);
      return next;
    });
  };

  const handleRemove = (type: InstructionType) => {
    setInstructions((prev) => {
      const next = new Map(prev);
      next.delete(type);
      return next;
    });
  };

  const handleSave = async () => {
    if (!configRowId) {
      setError("Nenhuma configuração encontrada para salvar");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const fields = buildInstructionFields(instructions);
      await updateBaserowConfig(configRowId, fields);
      setSuccessMessage("Configurações do agente salvas com sucesso!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error("Erro ao salvar configuração do agente:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao salvar configuração",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando configuração do agente..." />;
  }

  // Se múltiplos números e nenhum configId selecionado → mostrar seletor
  if (!configRowId && !error && phoneOptions.length > 1) {
    return (
      <div>
        <div className="flex flex-col gap-4">
          <div className="border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-3">
            <p className="text-sm font-semibold">Selecione o número para configurar o agente</p>
            <p className="text-xs text-muted-foreground">
              Sua instituição possui múltiplos números. Escolha qual deseja configurar.
            </p>
          </div>
          {phoneOptions.map((opt) => (
            <button
              key={opt.configId}
              type="button"
              onClick={() => handleSelectPhone(opt.configId)}
              className="border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-4 text-left hover:bg-accent/50 transition-colors"
            >
              <p className="text-sm font-semibold">{opt.phoneNumber}</p>
              <p className="text-xs text-muted-foreground">
                Config #{opt.configId}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4">
        {/* Label do telefone selecionado */}
        {selectedPhone && (
          <div className="border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-2">
            <p className="text-xs text-muted-foreground">
              Configurando agente para:{" "}
              <span className="font-semibold text-foreground">{selectedPhone}</span>
              {phoneOptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => router.push("/configuracoes/agente")}
                  className="ml-2 text-xs text-primary underline underline-offset-2 hover:opacity-80"
                >
                  Trocar número
                </button>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="border-b border-destructive px-3 sm:px-4 py-3">
            <p className="text-sm font-semibold text-destructive">Erro</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="border-b border-emerald-300 dark:border-emerald-700 px-3 sm:px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30">
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              {successMessage}
            </p>
          </div>
        )}

        {!configRowId && !error && (
          <div className="py-12 text-center text-muted-foreground">
            Nenhuma configuração encontrada. Complete o onboarding primeiro.
          </div>
        )}

        {configRowId && (
          <InstructionList
            instructions={instructions}
            onChange={handleChange}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onSave={handleSave}
            onReload={loadConfig}
            isSaving={isSaving}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}

export default function AgentConfigPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Carregando configuração do agente..." />}>
      <AgentConfigContent />
    </Suspense>
  );
}

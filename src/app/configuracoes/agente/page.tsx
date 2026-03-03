"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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

export default function AgentConfigPage() {
  const router = useRouter();
  const { data, isHydrated } = useOnboarding();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [configRowId, setConfigRowId] = useState<number | null>(null);
  const [instructions, setInstructions] = useState<
    Map<InstructionType, unknown>
  >(new Map());

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth]);

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
      const latest = configs.reduce(
        (cur, cand) => (cand.id > cur.id ? cand : cur),
        configs[0],
      );
      setConfigRowId(latest.id);
      const row = latest as Record<string, unknown>;
      setInstructions(readActiveInstructions(row));
    } catch (err) {
      console.error("Erro ao carregar configuração do agente:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar configuração",
      );
    } finally {
      setIsLoading(false);
    }
  }, [data.auth]);

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
      if (def.fieldType === "toggle") defaultValue = false;
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

  return (
    <div>
      <div className="flex flex-col gap-4">
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

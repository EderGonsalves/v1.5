"use client";

import { Loader2, Shuffle } from "lucide-react";
import { useQueueMode } from "@/hooks/use-queue-mode";
import { updateQueueMode, type QueueMode } from "@/services/queue-mode-client";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useState } from "react";

export default function DistribuicaoPage() {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId ?? null;
  const { queueMode, setQueueMode } = useQueueMode();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async (newMode: QueueMode) => {
    if (!institutionId) return;
    setIsUpdating(true);
    try {
      await updateQueueMode(newMode);
      setQueueMode(newMode);
    } catch {
      // Silent fail
    } finally {
      setIsUpdating(false);
    }
  };

  if (!institutionId) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Faça login para acessar esta configuração.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-[#7E99B5] dark:border-border/60 pb-3">
        <Shuffle className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Modo de distribuição de casos
          </h2>
          <p className="text-xs text-muted-foreground">
            Escolha como os novos casos são distribuídos entre os atendentes.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={queueMode}
          onChange={(e) => handleChange(e.target.value as QueueMode)}
          disabled={isUpdating}
          className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <option value="round_robin">Round-Robin (automático)</option>
          <option value="manual">Fila de Espera (manual)</option>
        </select>
        {isUpdating && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {queueMode === "manual"
          ? "Casos novos ficam na fila de espera. Atendentes devem clicar em 'Pegar' para assumir um caso."
          : "Casos novos são atribuídos automaticamente ao próximo atendente disponível."}
      </p>
    </div>
  );
}

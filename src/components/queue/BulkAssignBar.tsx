"use client";

import { useState } from "react";
import { Loader2, Users, X } from "lucide-react";

import type { UserPublicRow } from "@/services/permissions";
import { bulkAssignCases } from "@/services/queue-mode-client";

type BulkAssignBarProps = {
  selectedCaseIds: Set<number>;
  eligibleUsers: UserPublicRow[];
  onClearSelection: () => void;
  onAssignComplete: (result: {
    successCount: number;
    skippedCount: number;
    failedCount: number;
    targetUserName: string;
  }) => void;
};

export function BulkAssignBar({
  selectedCaseIds,
  eligibleUsers,
  onClearSelection,
  onAssignComplete,
}: BulkAssignBarProps) {
  const [targetUserId, setTargetUserId] = useState<number | "">("");
  const [isAssigning, setIsAssigning] = useState(false);

  if (selectedCaseIds.size === 0) return null;

  const handleAssign = async () => {
    if (!targetUserId) return;

    setIsAssigning(true);
    try {
      const result = await bulkAssignCases(
        Array.from(selectedCaseIds),
        targetUserId,
      );
      const targetUser = eligibleUsers.find((u) => u.id === targetUserId);
      onAssignComplete({
        successCount: result.successCount,
        skippedCount: result.skipped.length,
        failedCount: result.failed.length,
        targetUserName: targetUser?.name ?? "Atendente",
      });
      setTargetUserId("");
    } catch (err) {
      console.error("Erro ao atribuir em lote:", err);
      alert(err instanceof Error ? err.message : "Erro ao atribuir casos");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl max-w-[90vw]">
      <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <Users className="h-4 w-4" />
        <span>{selectedCaseIds.size} selecionado{selectedCaseIds.size > 1 ? "s" : ""}</span>
      </div>

      <select
        value={targetUserId}
        onChange={(e) => setTargetUserId(e.target.value ? Number(e.target.value) : "")}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm min-w-[160px]"
        disabled={isAssigning}
      >
        <option value="">Selecionar atendente...</option>
        {eligibleUsers
          .filter((u) => u.isActive)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </select>

      <button
        onClick={handleAssign}
        disabled={!targetUserId || isAssigning}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        {isAssigning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Atribuir {selectedCaseIds.size} caso{selectedCaseIds.size > 1 ? "s" : ""}
      </button>

      <button
        onClick={onClearSelection}
        disabled={isAssigning}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        title="Cancelar seleção"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

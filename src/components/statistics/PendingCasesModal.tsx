"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Clock, Loader2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { PendingCaseRow } from "@/app/api/cases/pending/route";
import type { UserPublicRow } from "@/services/permissions";
import { useUsers } from "@/hooks/use-users";
import { updateBaserowCase } from "@/services/api";
import { notifyTransferWebhook } from "@/services/transfer-notify";

type PendingCasesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsavelName: string;
  institutionId: number;
  canTransfer: boolean;
  currentUserName?: string;
  onTransferred?: () => void;
};

function formatPendingTime(createdAt: string | null): string {
  if (!createdAt) return "Data desconhecida";

  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return "Data invalida";

  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  if (diffMs < 0) return "Agora";

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} ${months === 1 ? "mes" : "meses"}`;
  if (days > 0) return `${days} ${days === 1 ? "dia" : "dias"}`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return "Agora";
}

function formatDate(createdAt: string | null): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PendingCasesModal({
  open,
  onOpenChange,
  responsavelName,
  institutionId,
  canTransfer,
  currentUserName,
  onTransferred,
}: PendingCasesModalProps) {
  const [cases, setCases] = useState<PendingCaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferTargets, setTransferTargets] = useState<Record<number, string>>({});
  const isFetchingRef = useRef(false);

  const { users } = useUsers(institutionId);
  const activeUsers = useMemo(
    () => users.filter((u) => u.isActive && u.name !== responsavelName),
    [users, responsavelName],
  );

  const fetchPendingCases = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        responsavel: responsavelName,
        institutionId: String(institutionId),
      });
      const res = await fetch(`/api/cases/pending?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erro ao buscar casos pendentes");
      }
      const data = await res.json();
      setCases(data.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [responsavelName, institutionId]);

  useEffect(() => {
    if (open) {
      fetchPendingCases();
      setTransferTargets({});
    }
  }, [open, fetchPendingCases]);

  const handleTransfer = async (caseRow: PendingCaseRow) => {
    const targetName = transferTargets[caseRow.id];
    if (!targetName) return;

    const targetUser = users.find((u) => u.name === targetName);
    if (!targetUser) return;

    setTransferringId(caseRow.id);
    try {
      await updateBaserowCase(caseRow.id, {
        responsavel: targetUser.name,
        assigned_to_user_id: targetUser.id,
      });

      // Ghost message
      const ghostMsg = currentUserName
        ? `📋 ${currentUserName} transferiu o caso para ${targetUser.name}`
        : `📋 Caso transferido para ${targetUser.name}`;

      sendGhostMessage(caseRow.id, ghostMsg);

      // Webhook
      notifyTransferWebhook({
        type: "transfer",
        user: targetUser,
        caseInfo: {
          id: caseRow.id,
          caseId: caseRow.caseId ?? undefined,
          customerName: caseRow.customerName,
          customerPhone: caseRow.customerPhone,
          institutionId: caseRow.institutionId,
          responsavel: targetUser.name,
        },
      });

      // Remove from local list
      setCases((prev) => prev.filter((c) => c.id !== caseRow.id));
      onTransferred?.();
    } catch (err) {
      console.error("Erro ao transferir caso:", err);
      setError("Erro ao transferir caso. Tente novamente.");
    } finally {
      setTransferringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Casos pendentes — {responsavelName}
          </DialogTitle>
          <DialogDescription>
            {cases.length} {cases.length === 1 ? "caso pendente" : "casos pendentes"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-6 px-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {!isLoading && !error && cases.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum caso pendente encontrado.
            </p>
          )}

          {!isLoading && cases.length > 0 && (
            <div className="space-y-2">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium truncate">
                      {c.customerName || "Sem nome"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.customerPhone || "Sem telefone"}
                      {c.caseId ? ` — Caso #${c.caseId}` : ""}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {formatPendingTime(c.createdAt)}
                      </span>
                      {c.createdAt && (
                        <span className="ml-1">({formatDate(c.createdAt)})</span>
                      )}
                    </div>
                  </div>

                  {canTransfer && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={transferTargets[c.id] ?? ""}
                        onChange={(e) =>
                          setTransferTargets((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        disabled={transferringId === c.id}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground sm:w-[180px]"
                      >
                        <option value="">Transferir para...</option>
                        {activeUsers.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !transferTargets[c.id] || transferringId === c.id
                        }
                        onClick={() => handleTransfer(c)}
                        className="shrink-0"
                      >
                        {transferringId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function sendGhostMessage(caseId: number, message: string) {
  try {
    const formData = new FormData();
    formData.append("content", message);
    formData.append("sender", "sistema");
    formData.append("type", "ghost");
    await fetch(`/api/cases/${caseId}/messages`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    console.error("Erro ao enviar ghost message:", err);
  }
}

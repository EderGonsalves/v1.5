"use client";

import { useState } from "react";
import { Clock, Hand, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { claimCase } from "@/services/queue-mode-client";
import type { BaserowCaseRow } from "@/services/api";

type QueueKanbanColumnProps = {
  cases: BaserowCaseRow[];
  onCardClick: (caseRow: BaserowCaseRow) => void;
  onCaseClaimed?: () => void;
  isAdmin?: boolean;
};

export function QueueKanbanColumn({
  cases,
  onCardClick,
  onCaseClaimed,
  isAdmin,
}: QueueKanbanColumnProps) {
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const handleClaim = async (caseId: number) => {
    setClaimingId(caseId);
    try {
      await claimCase(caseId);
      onCaseClaimed?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao pegar caso");
      onCaseClaimed?.();
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col w-[78vw] sm:w-[55vw] lg:w-[calc((100vw-6rem)/5)] min-w-[150px] lg:max-w-[280px] rounded-lg border dark:border-[#354F6D] border-t-4 transition-colors snap-start",
        "border-t-amber-500 bg-amber-50/50 dark:bg-[#1B263B]",
      )}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />

          <h3 className="font-semibold text-sm text-foreground truncate flex-1 min-w-0 px-1 py-0.5">
            Fila de Espera
          </h3>

          <span className="px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-[#263850] dark:text-[#D4E0EB]">
            {cases.length}
          </span>
        </div>
      </div>

      {/* Cards Container */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-250px)] scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {cases.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Nenhum caso na fila de espera
          </div>
        ) : (
          cases.map((caseRow) => (
            <div key={caseRow.id} className="relative group">
              <KanbanCard
                caseData={caseRow}
                onClick={() => onCardClick(caseRow)}
              />
              {/* Claim button overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClaim(caseRow.id);
                }}
                disabled={claimingId === caseRow.id}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-md transition opacity-0 group-hover:opacity-100 hover:bg-primary/90 disabled:opacity-100 disabled:bg-primary/70"
              >
                {claimingId === caseRow.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Hand className="h-3 w-3" />
                )}
                Pegar
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

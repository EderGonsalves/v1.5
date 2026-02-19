"use client";

import { Loader2, MessageSquareText, Hand } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { getCaseStage, stageLabels, stageColors } from "@/lib/case-stats";
import type { BaserowCaseRow } from "@/services/api";

type QueueCaseItemProps = {
  caseRow: BaserowCaseRow;
  onClaim: (caseId: number) => Promise<void>;
  isClaiming: boolean;
  onClick: () => void;
  /** Show checkbox for bulk selection (admin only) */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (caseId: number, checked: boolean) => void;
};

export function QueueCaseItem({
  caseRow,
  onClaim,
  isClaiming,
  onClick,
  selectable,
  selected,
  onSelectChange,
}: QueueCaseItemProps) {
  const stage = getCaseStage(caseRow);

  return (
    <div
      onClick={onClick}
      className="cursor-pointer border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors hover:bg-accent/50 active:bg-accent/70"
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
        {selectable && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => {
              e.stopPropagation();
              onSelectChange?.(caseRow.id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-primary accent-primary shrink-0"
          />
        )}

        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold truncate max-w-[55vw] sm:max-w-[200px]">
            {caseRow.CustumerName || "Sem nome"}
          </h3>
          {stage && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0",
                stageColors[stage],
              )}
            >
              {stageLabels[stage]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {caseRow.Data && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {caseRow.Data}
            </span>
          )}
          <Link
            href={`/chat?case=${caseRow.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-900/30 dark:text-blue-200 whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageSquareText className="h-3 w-3" />
            Chat
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClaim(caseRow.id);
            }}
            disabled={isClaiming}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
          >
            {isClaiming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Hand className="h-3 w-3" />
            )}
            Pegar
          </button>
        </div>
      </div>
    </div>
  );
}

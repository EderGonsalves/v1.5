"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Gavel,
  ScrollText,
  Clock,
} from "lucide-react";
import type { LawsuitMovement } from "@/services/lawsuit";

type MovementTimelineProps = {
  movements: LawsuitMovement[];
  isLoading?: boolean;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  movimentacao: {
    label: "Movimentação",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: Gavel,
  },
  capa: {
    label: "Capa",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    icon: ScrollText,
  },
  documento: {
    label: "Documento",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: FileText,
  },
  raw: {
    label: "Dados Brutos",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    icon: FileText,
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.movimentacao;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function MovementItem({ movement }: { movement: LawsuitMovement }) {
  const [expanded, setExpanded] = useState(false);
  const config = getTypeConfig(movement.movement_type);
  const Icon = config.icon;
  const hasContent = !!movement.content && movement.content.length > 0;

  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border last:hidden" />

      {/* Timeline dot */}
      <div className="absolute left-0 top-1 w-6 h-6 rounded-full border-2 border-[#7E99B5] dark:border-[#456585] bg-background flex items-center justify-center">
        <Icon className="h-3 w-3 text-[#456585] dark:text-[#7E99B5]" />
      </div>

      {/* Content */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
                {config.label}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(movement.movement_date)}
              </span>
              {movement.source_court && (
                <span className="text-xs text-muted-foreground">
                  {movement.source_court}
                </span>
              )}
            </div>
            <p className="text-sm font-medium">{movement.title}</p>
          </div>

          {hasContent && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {expanded && hasContent && (
          <div className="mt-2 pt-2 border-t">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {movement.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function MovementTimeline({ movements, isLoading }: MovementTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="relative pl-8">
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-muted animate-pulse" />
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <ScrollText className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Nenhuma movimentação registrada</p>
        <p className="text-xs mt-1">As movimentações aparecerão aqui quando a Codilo enviar atualizações</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {movements.map((m) => (
        <MovementItem key={m.id} movement={m} />
      ))}
    </div>
  );
}

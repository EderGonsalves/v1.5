"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Phone, Calendar, User, GripVertical, Scale, DollarSign, Bot } from "lucide-react";
import type { BaserowCaseRow } from "@/services/api";
import { getCaseStage, stageLabels, stageColors } from "@/lib/case-stats";

export type CaseTagBadge = {
  id: number;
  name: string;
  color: string;
  category: string;
  assignedBy?: string;
  confidence?: number | null;
};

type KanbanCardProps = {
  caseData: BaserowCaseRow;
  caseTags?: CaseTagBadge[];
  isDragging?: boolean;
  onClick?: () => void;
};

export function KanbanCard({
  caseData,
  caseTags,
  isDragging,
  onClick,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDraggingNow } = useDraggable({
    id: Number(caseData.id),
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  const stage = getCaseStage(caseData);
  const isPaused = (caseData.IApause || "").toLowerCase() === "sim";
  const resultado = (caseData.resultado || "").toLowerCase();
  const isGanho = resultado === "ganho";
  const isPerdido = resultado === "perdido";

  const rawValor = caseData.valor;
  const parsedValor = rawValor != null && rawValor !== ""
    ? (typeof rawValor === "string" ? parseFloat(rawValor) : rawValor)
    : NaN;
  const hasValor = !isNaN(parsedValor) && parsedValor > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white dark:bg-[#263850] rounded-lg border border-border dark:border-[#354F6D] shadow-sm p-3 cursor-pointer transition-all",
        "hover:shadow-md hover:border-primary/50",
        isDragging && "opacity-50",
        isDraggingNow && "opacity-50 shadow-lg scale-105",
        isGanho && "border-l-4 border-l-green-500",
        isPerdido && "border-l-4 border-l-red-500"
      )}
      onClick={onClick}
    >
      {/* Drag Handle */}
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 p-0.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Customer Name */}
          <div className="flex items-center gap-2 mb-1">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">
              {caseData.CustumerName || "Sem nome"}
            </span>
          </div>

          {/* Phone */}
          {caseData.CustumerPhone && (
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">
                {caseData.CustumerPhone}
              </span>
            </div>
          )}

          {/* Date */}
          {caseData.Data && (
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">
                {caseData.Data}
              </span>
            </div>
          )}

          {/* Valor */}
          {hasValor && (
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {parsedValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {stage && (
              <span
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium rounded-full",
                  stageColors[stage]
                )}
              >
                {stageLabels[stage]}
              </span>
            )}
            {isPaused && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                IA Pausada
              </span>
            )}
            {isGanho && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                Ganho
              </span>
            )}
            {isPerdido && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">
                Perdido
              </span>
            )}
            {caseData.lawsuit_tracking_active === "true" && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200" title="Processo monitorado">
                <Scale className="h-3 w-3 inline-block" />
              </span>
            )}
            {/* Case Tags */}
            {caseTags && caseTags.length > 0 && (
              <>
                {caseTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded-full text-white"
                    style={{ backgroundColor: tag.color }}
                    title={tag.assignedBy === "ai" ? `IA${tag.confidence != null ? ` - ${Math.round(tag.confidence * 100)}%` : ""}` : undefined}
                  >
                    {tag.assignedBy === "ai" && <Bot className="h-2.5 w-2.5" />}
                    {tag.name}
                  </span>
                ))}
                {caseTags.length > 3 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
                    +{caseTags.length - 3}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

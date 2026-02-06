"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Phone, Calendar, User, GripVertical, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BaserowCaseRow } from "@/services/api";
import { getCaseStage, stageLabels, stageColors } from "@/lib/case-stats";

type KanbanCardProps = {
  caseData: BaserowCaseRow;
  isDragging?: boolean;
  onClick?: () => void;
  onUpdateValor?: (caseId: number, valor: number) => void;
  onUpdateResultado?: (caseId: number, resultado: "ganho" | "perdido") => void;
};

const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const parseCurrencyInput = (value: string): number => {
  // Remove tudo exceto números, vírgula e ponto
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export function KanbanCard({
  caseData,
  isDragging,
  onClick,
  onUpdateValor,
  onUpdateResultado
}: KanbanCardProps) {
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorInput, setValorInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

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
  const valor = caseData.valor;

  const handleValorDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentValor = typeof valor === "number" ? valor : (typeof valor === "string" ? parseFloat(valor) : 0);
    setValorInput(isNaN(currentValor) ? "" : currentValor.toString());
    setIsEditingValor(true);
  };

  const handleValorSave = async () => {
    const newValor = parseCurrencyInput(valorInput);
    setIsEditingValor(false);
    if (onUpdateValor) {
      setIsUpdating(true);
      try {
        await onUpdateValor(caseData.id, newValor);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleValorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleValorSave();
    } else if (e.key === "Escape") {
      setIsEditingValor(false);
    }
  };

  const handleResultadoClick = async (e: React.MouseEvent, newResultado: "ganho" | "perdido") => {
    e.stopPropagation();
    if (onUpdateResultado && !isUpdating) {
      setIsUpdating(true);
      try {
        await onUpdateResultado(caseData.id, newResultado);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white dark:bg-zinc-800 rounded-lg border border-border shadow-sm p-3 cursor-pointer transition-all",
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

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
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
          </div>

          {/* Valor da causa */}
          <div
            className="flex items-center gap-1.5 mb-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[10px] text-muted-foreground">Valor da causa:</span>
            {isEditingValor ? (
              <Input
                type="text"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                onBlur={handleValorSave}
                onKeyDown={handleValorKeyDown}
                className="h-5 w-20 text-[10px] px-1"
                placeholder="0,00"
                autoFocus
              />
            ) : (
              <span
                className="text-[10px] font-medium text-green-600 dark:text-green-400 cursor-pointer hover:underline"
                onDoubleClick={handleValorDoubleClick}
                title="Clique duplo para editar"
              >
                {formatCurrency(valor) || "R$ 0,00"}
              </span>
            )}
          </div>

          {/* Ganho/Perdido Buttons */}
          {!isGanho && !isPerdido && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="h-5 px-1.5 text-[10px] gap-0.5 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                onClick={(e) => handleResultadoClick(e, "ganho")}
                disabled={isUpdating}
              >
                <Check className="h-2.5 w-2.5" />
                Ganho
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-5 px-1.5 text-[10px] gap-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={(e) => handleResultadoClick(e, "perdido")}
                disabled={isUpdating}
              >
                <X className="h-2.5 w-2.5" />
                Perdido
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

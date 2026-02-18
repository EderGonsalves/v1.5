"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";
import { KanbanCard } from "./KanbanCard";
import type { KanbanColumnRow, BaserowCaseRow } from "@/services/api";

const colorMap: Record<string, string> = {
  blue: "border-t-blue-500 bg-blue-50/50 dark:bg-[#1B263B]",
  amber: "border-t-amber-500 bg-amber-50/50 dark:bg-[#1B263B]",
  purple: "border-t-purple-500 bg-purple-50/50 dark:bg-[#1B263B]",
  green: "border-t-green-500 bg-green-50/50 dark:bg-[#1B263B]",
  red: "border-t-red-500 bg-red-50/50 dark:bg-[#1B263B]",
  gray: "border-t-gray-500 bg-gray-50/50 dark:bg-[#1B263B]",
  pink: "border-t-pink-500 bg-pink-50/50 dark:bg-[#1B263B]",
  indigo: "border-t-indigo-500 bg-indigo-50/50 dark:bg-[#1B263B]",
  cyan: "border-t-cyan-500 bg-cyan-50/50 dark:bg-[#1B263B]",
  orange: "border-t-orange-500 bg-orange-50/50 dark:bg-[#1B263B]",
};

const countColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  amber: "bg-amber-100 text-amber-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  purple: "bg-purple-100 text-purple-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  green: "bg-green-100 text-green-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  red: "bg-red-100 text-red-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  gray: "bg-gray-100 text-gray-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  pink: "bg-pink-100 text-pink-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
  orange: "bg-orange-100 text-orange-700 dark:bg-[#263850] dark:text-[#D4E0EB]",
};

type KanbanColumnProps = {
  column: KanbanColumnRow;
  cases: BaserowCaseRow[];
  onCardClick: (caseData: BaserowCaseRow) => void;
  onColumnUpdate?: (columnId: number, name: string) => void;
  isDraggingColumn?: boolean;
};

export function KanbanColumn({
  column,
  cases,
  onCardClick,
  onColumnUpdate,
  isDraggingColumn
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(column.name || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const columnId = Number(column.id);

  // Calculate total value of all cases with valor in this column
  const totalValue = useMemo(() => {
    return cases.reduce((sum, caseRow) => {
      const valor = caseRow.valor;
      if (valor === null || valor === undefined || valor === "") return sum;
      const num = typeof valor === "string" ? parseFloat(valor) : valor;
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [cases]);

  const formatCurrency = (value: number): string => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Droppable for cards
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-drop-${columnId}`,
    data: { type: "column", columnId },
  });

  // Sortable for column reordering
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `column-${columnId}`,
    data: { type: "column", column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Combine refs
  const setNodeRef = (node: HTMLElement | null) => {
    setDroppableRef(node);
    setSortableRef(node);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setEditName(column.name || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmedName = editName.trim();
    if (trimmedName && trimmedName !== column.name && onColumnUpdate) {
      onColumnUpdate(Number(column.id), trimmedName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditName(column.name || "");
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  const color = column.color || "gray";
  const columnColor = colorMap[color] || colorMap.gray;
  const countColor = countColorMap[color] || countColorMap.gray;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col w-[78vw] sm:w-[55vw] lg:w-[calc((100vw-6rem)/5)] min-w-[150px] lg:max-w-[280px] rounded-lg border dark:border-[#354F6D] border-t-4 transition-colors snap-start",
        columnColor,
        isOver && "ring-2 ring-primary ring-offset-2",
        isDragging && "opacity-50 shadow-2xl",
        isDraggingColumn && !isDragging && "opacity-70"
      )}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <button
            {...listeners}
            {...attributes}
            className="p-0.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing flex-shrink-0"
            title="Arrastar coluna"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Column Name - Editable */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="w-full px-1 py-0.5 text-sm font-semibold bg-white dark:bg-zinc-800 border border-primary rounded outline-none"
              />
            ) : (
              <h3
                onDoubleClick={handleDoubleClick}
                className="font-semibold text-sm text-foreground truncate cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded"
                title="Clique duplo para editar"
              >
                {column.name || "Sem nome"}
              </h3>
            )}
          </div>

          {/* Count Badge */}
          <span
            className={cn(
              "px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0",
              countColor
            )}
          >
            {cases.length}
          </span>
        </div>

        {/* Total value of cases in column */}
        {totalValue > 0 && (
          <div className="mt-1.5 ml-7 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Total: {formatCurrency(totalValue)}
          </div>
        )}
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-250px)] scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {cases.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Nenhum caso nesta coluna
          </div>
        ) : (
          cases.map((caseData) => (
            <KanbanCard
              key={caseData.id}
              caseData={caseData}
              onClick={() => onCardClick(caseData)}
            />
          ))
        )}
      </div>
    </div>
  );
}

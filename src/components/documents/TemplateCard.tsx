"use client";

import { Pencil, Trash2, FileText, FileCode, Upload } from "lucide-react";
import type { DocumentTemplateRow } from "@/lib/documents/types";

const TYPE_STYLES: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  html: {
    label: "Editor",
    icon: FileCode,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  direct_pdf: {
    label: "PDF",
    icon: FileText,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  direct_docx: {
    label: "DOCX",
    icon: Upload,
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
};

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  contrato: {
    label: "Contrato",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  procuracao: {
    label: "Procuração",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  declaracao: {
    label: "Declaração",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  termo: {
    label: "Termo",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  outro: {
    label: "Outro",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
};

type TemplateCardProps = {
  template: DocumentTemplateRow;
  onEdit: (template: DocumentTemplateRow) => void;
  onDelete: (template: DocumentTemplateRow) => void;
};

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  // Baserow single select pode retornar objeto { id, value, color }
  const rawCat = template.category;
  const catKey = typeof rawCat === "object" && rawCat !== null
    ? (rawCat as unknown as { value: string }).value
    : rawCat;
  const cat = CATEGORY_STYLES[catKey] ?? CATEGORY_STYLES.outro;
  const tType = TYPE_STYLES[template.template_type] ?? TYPE_STYLES.html;
  const TypeIcon = tType.icon;
  const varCount = (() => {
    try {
      return JSON.parse(template.variables || "[]").length;
    } catch {
      return 0;
    }
  })();
  const isDirectType = template.template_type === "direct_pdf" || template.template_type === "direct_docx";

  return (
    <div className="border border-[#7E99B5] dark:border-border/60 rounded-lg p-4 bg-background hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm text-foreground truncate">
            {template.name}
          </h3>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          )}
          {template.original_filename && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {template.original_filename}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cat.className}`}
          >
            {cat.label}
          </span>
          {isDirectType && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tType.className}`}
            >
              <TypeIcon className="h-2.5 w-2.5" />
              {tType.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {varCount > 0 && (
            <span>{varCount} variáve{varCount === 1 ? "l" : "is"}</span>
          )}
          {template.created_at && (
            <span>
              {new Date(template.created_at).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(template)}
            title={isDirectType ? "Editar metadados" : "Editar"}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(template)}
            title="Excluir"
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

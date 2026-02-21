"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, FileText, ShieldAlert } from "lucide-react";
import { TemplateCard } from "@/components/documents/TemplateCard";
import { TemplateFormDialog } from "@/components/documents/TemplateFormDialog";
import {
  fetchTemplates,
  deleteDocumentTemplate,
} from "@/services/doc-templates-client";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import type { DocumentTemplateRow } from "@/lib/documents/types";

export default function TemplatesPage() {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId;

  const [templates, setTemplates] = useState<DocumentTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] =
    useState<DocumentTemplateRow | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (institutionId) loadTemplates();
  }, [institutionId, loadTemplates]);

  const handleCreate = () => {
    setEditTemplate(null);
    setDialogOpen(true);
  };

  const handleEdit = (template: DocumentTemplateRow) => {
    setEditTemplate(template);
    setDialogOpen(true);
  };

  const handleDelete = async (template: DocumentTemplateRow) => {
    if (!confirm(`Excluir o modelo "${template.name}"?`)) return;
    try {
      await deleteDocumentTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const handleSaved = (saved: DocumentTemplateRow) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Modelos de Documentos
            </h1>
            <p className="text-xs text-muted-foreground">
              Crie e gerencie modelos para contratos, procurações e outros
              documentos jurídicos.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Modelo</span>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nenhum modelo criado
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie seu primeiro modelo de documento para começar a enviar
              documentos para assinatura.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-4 flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Criar Modelo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTemplate={editTemplate}
        onSaved={handleSaved}
      />
    </div>
  );
}

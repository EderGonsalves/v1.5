"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateFormDialog } from "./TemplateFormDialog";
import { TemplatePreview } from "./TemplatePreview";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { fetchInstitutionsClient } from "@/services/permissions-client";
import type { Template, TemplateStatus } from "@/lib/waba/schemas";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Ban,
  Plus,
  Trash2,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";

const SYSADMIN_INSTITUTION_ID = 4;

const STATUS_CONFIG: Record<
  TemplateStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  APPROVED: {
    label: "Aprovado",
    color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle,
  },
  PENDING: {
    label: "Pendente",
    color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: Clock,
  },
  REJECTED: {
    label: "Rejeitado",
    color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  DISABLED: {
    label: "Desativado",
    color: "text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
    icon: Ban,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  UTILITY: "Utilitário",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "APPROVED", label: "Aprovados" },
  { value: "PENDING", label: "Pendentes" },
  { value: "REJECTED", label: "Rejeitados" },
];

export const TemplateList = () => {
  const { data } = useOnboarding();
  const isSysAdmin = data.auth?.institutionId === SYSADMIN_INSTITUTION_ID;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Modal states (replacing native confirm/alert)
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // SysAdmin institution selector
  const [institutions, setInstitutions] = useState<
    Array<{ institutionId: number; companyName: string }>
  >([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    number | undefined
  >(undefined);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  // Fetch institutions for SysAdmin
  useEffect(() => {
    if (!isSysAdmin) return;
    let active = true;
    setLoadingInstitutions(true);
    fetchInstitutionsClient()
      .then((list) => {
        if (active) {
          setInstitutions(list);
          // Auto-select the first institution
          if (list.length > 0 && !selectedInstitutionId) {
            setSelectedInstitutionId(list[0].institutionId);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingInstitutions(false);
      });
    return () => {
      active = false;
    };
  }, [isSysAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build query string with institutionId for SysAdmin
  const buildQs = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      if (isSysAdmin && selectedInstitutionId) {
        params.set("institutionId", String(selectedInstitutionId));
      }
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
      }
      const str = params.toString();
      return str ? `?${str}` : "";
    },
    [filter, isSysAdmin, selectedInstitutionId],
  );

  const fetchTemplates = useCallback(async () => {
    // SysAdmin must select an institution first
    if (isSysAdmin && !selectedInstitutionId) {
      setTemplates([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/waba/templates${buildQs()}`);
      if (!res.ok) {
        const respData = await res.json().catch(() => ({}));
        throw new Error(respData.error || `Erro ${res.status}`);
      }
      const respData = await res.json();
      setTemplates(respData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar templates");
    } finally {
      setIsLoading(false);
    }
  }, [buildQs, isSysAdmin, selectedInstitutionId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async (payload: {
    name: string;
    category: string;
    language: string;
    components: unknown[];
  }) => {
    const res = await fetch(`/api/v1/waba/templates${buildQs()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const respData = await res.json().catch(() => ({}));
      throw new Error(
        respData.error || respData.details?.error?.message || `Erro ${res.status}`,
      );
    }
    await fetchTemplates();
  };

  const handleDeleteConfirmed = async () => {
    const templateName = confirmDeleteName;
    if (!templateName) return;
    setConfirmDeleteName(null);

    setDeletingName(templateName);
    try {
      const instParam =
        isSysAdmin && selectedInstitutionId
          ? `?institutionId=${selectedInstitutionId}`
          : "";
      const res = await fetch(
        `/api/v1/waba/templates/${encodeURIComponent(templateName)}${instParam}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const respData = await res.json().catch(() => ({}));
        throw new Error(respData.error || `Erro ${res.status}`);
      }
      await fetchTemplates();
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : "Erro ao deletar template");
    } finally {
      setDeletingName(null);
    }
  };

  const getBodyText = (template: Template): string => {
    const body = template.components.find((c) => c.type === "BODY");
    return body?.text ?? "";
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            Templates WhatsApp
          </h2>
          <p className="text-xs text-muted-foreground">
            Modelos de mensagem para iniciar conversas
          </p>
        </div>
        <Button
          onClick={() => setIsFormOpen(true)}
          size="sm"
          className="shrink-0"
          disabled={isSysAdmin && !selectedInstitutionId}
        >
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Novo Template</span>
        </Button>
      </div>

      {/* SysAdmin institution selector */}
      {isSysAdmin && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 px-3 sm:px-4 py-2 border-b border-[#7E99B5] dark:border-border/60 bg-muted/30">
          <div className="flex items-center gap-1.5 shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              Escritório:
            </span>
          </div>
          {loadingInstitutions ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <select
              value={selectedInstitutionId ?? ""}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSelectedInstitutionId(val || undefined);
              }}
              className="h-8 w-full sm:flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-0"
            >
              <option value="">Selecione um escritório</option>
              {institutions.map((inst) => (
                <option key={inst.institutionId} value={inst.institutionId}>
                  {inst.companyName} (ID: {inst.institutionId})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 sm:px-4 py-2 border-b border-[#7E99B5] dark:border-border/60 overflow-x-auto scrollbar-hide">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:hover:bg-secondary/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isSysAdmin && !selectedInstitutionId ? (
        <div className="px-4 py-8 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h4 className="mt-3 text-sm font-semibold">
            Selecione um escritório
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha o escritório acima para gerenciar seus templates.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            onClick={fetchTemplates}
            variant="outline"
            size="sm"
            className="mt-3"
          >
            Tentar novamente
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h4 className="mt-3 text-sm font-semibold">
            Nenhum template encontrado
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie seu primeiro template para iniciar conversas pelo WhatsApp.
          </p>
          <Button
            onClick={() => setIsFormOpen(true)}
            className="mt-3"
            variant="outline"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar template
          </Button>
        </div>
      ) : (
        <div>
          {templates.map((template) => {
            const statusCfg = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.PENDING;
            const StatusIcon = statusCfg.icon;
            const isExpanded = expandedTemplate === template.name;

            return (
              <div
                key={template.id}
                className="border-b border-[#7E99B5] dark:border-border/60 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${statusCfg.color}`}
                  >
                    <StatusIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold font-mono">
                        {template.name}
                      </h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {CATEGORY_LABELS[template.category] ?? template.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {template.language}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {getBodyText(template) || "(sem corpo)"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        setExpandedTemplate(isExpanded ? null : template.name)
                      }
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteName(template.name)}
                      disabled={deletingName === template.name}
                    >
                      {deletingName === template.name ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded preview */}
                {isExpanded && (
                  <div className="mt-3 rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-4">
                    <TemplatePreview components={template.components} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <TemplateFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleCreate}
      />

      {/* Confirm delete dialog */}
      <Dialog
        open={!!confirmDeleteName}
        onOpenChange={(open) => { if (!open) setConfirmDeleteName(null); }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Deletar template</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar o template{" "}
              <span className="font-semibold font-mono">{confirmDeleteName}</span>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteName(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirmed}>
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error dialog */}
      <Dialog
        open={!!errorModal}
        onOpenChange={(open) => { if (!open) setErrorModal(null); }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Erro
            </DialogTitle>
            <DialogDescription className="text-sm">
              {errorModal}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

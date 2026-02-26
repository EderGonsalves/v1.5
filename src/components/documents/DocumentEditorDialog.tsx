"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "./RichTextEditor";
import { AVAILABLE_VARIABLES } from "@/lib/documents/types";
import type { DocumentTemplateRow, SignEnvelopeRow } from "@/lib/documents/types";
import type { BaserowCaseRow, ClientRow } from "@/services/api";
import { fetchTemplates, fetchTemplateWithContent } from "@/services/doc-templates-client";
import { createSignEnvelope } from "@/services/riasign-client";
import {
  buildVariableContext,
  interpolateVariables,
} from "@/lib/documents/variables";
import {
  FileText,
  ArrowRight,
  ArrowLeft,
  Send,
  Loader2,
  Upload,
  FileCode,
  Plus,
  X,
  Phone,
} from "lucide-react";

const ALL_VAR_KEYS = AVAILABLE_VARIABLES.flatMap((g) =>
  g.variables.map((v) => v.key),
);

type WabaPhoneOption = {
  phoneNumber: string;
  configId: number;
  label?: string;
  wabaPhoneId?: string | null;
  riasignWabaConfigId?: string | null;
  institutionId?: number | null;
  institutionName?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData: BaserowCaseRow;
  clientData?: ClientRow | null;
  institutionId: number;
  onEnvelopeCreated: (envelope: SignEnvelopeRow) => void;
};

type Step = "select" | "edit" | "sign";

export function DocumentEditorDialog({
  open,
  onOpenChange,
  caseData,
  clientData,
  institutionId,
  onEnvelopeCreated,
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [templates, setTemplates] = useState<DocumentTemplateRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<DocumentTemplateRow | null>(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Signer form
  const [subject, setSubject] = useState("");
  const [signers, setSigners] = useState<
    Array<{ name: string; phone: string; email: string }>
  >([{ name: "", phone: "", email: "" }]);
  const [requireOtp, setRequireOtp] = useState(false);
  const [requireSelfie, setRequireSelfie] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState("");

  // WABA phone selection (SysAdmin)
  const [wabaPhones, setWabaPhones] = useState<WabaPhoneOption[]>([]);
  const [selectedWabaPhoneId, setSelectedWabaPhoneId] = useState("");

  const isDirectTemplate =
    selectedTemplate?.template_type === "direct_pdf" ||
    selectedTemplate?.template_type === "direct_docx";

  // Load templates on open
  useEffect(() => {
    if (!open) return;
    setStep("select");
    setError("");
    setSelectedTemplate(null);
    setHtmlContent("");
    fetchTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [open]);

  // Load WABA phone numbers for selection
  // Nota: esta aba só é visível para SysAdmin (gated no KanbanCardDetail)
  useEffect(() => {
    if (!open) return;
    setSelectedWabaPhoneId("");
    setWabaPhones([]);
    // SysAdmin (institutionId=4) vê todos os escritórios; demais veem apenas o seu
    const isSysAdmin = institutionId === 4;
    const qs = isSysAdmin ? "?all=true" : institutionId ? `?institutionId=${institutionId}` : "";
    fetch(`/api/waba/numbers${qs}`)
      .then((r) => (r.ok ? r.json() : { numbers: [] }))
      .then((data) => {
        const phones: WabaPhoneOption[] = data.numbers ?? [];
        setWabaPhones(phones);
        // Auto-selecionar se só tiver 1 com riasignWabaConfigId
        const withId = phones.filter((p) => p.riasignWabaConfigId);
        if (withId.length === 1) {
          setSelectedWabaPhoneId(withId[0].riasignWabaConfigId!);
        }
      })
      .catch(() => setWabaPhones([]));
  }, [open, institutionId]);

  // Pre-fill first signer from client data
  useEffect(() => {
    if (!open) return;
    setSigners([
      {
        name: clientData?.nome_completo || caseData.CustumerName || "",
        phone: clientData?.celular || caseData.CustumerPhone || "",
        email: clientData?.email || "",
      },
    ]);
  }, [open, clientData, caseData]);

  const handleSelectTemplate = async (template: DocumentTemplateRow) => {
    const tType = template.template_type || "html";
    const isDirect = tType === "direct_pdf" || tType === "direct_docx";

    setSelectedTemplate(template);
    setSubject(template.name);

    if (isDirect) {
      // Skip editor — go directly to sign step
      setHtmlContent("");
      setStep("sign");
      return;
    }

    // HTML template — load, interpolate, show editor
    setLoading(true);
    setError("");
    try {
      const resp = await fetchTemplateWithContent(template.id);
      const rawHtml = resp.htmlContent ?? "";

      // Mostrar aviso do servidor se houver
      const warning = (resp as Record<string, unknown>).warning;
      if (warning && typeof warning === "string") {
        setError(warning);
      }

      if (!rawHtml) {
        setError("Conteúdo HTML vazio — o arquivo do template pode não existir no servidor");
        setHtmlContent("");
        setStep("edit");
      } else {
        const context = buildVariableContext(caseData, clientData || null);
        const filled = interpolateVariables(rawHtml, context);
        setHtmlContent(filled);
        setStep("edit");
      }
    } catch (err) {
      console.error("[DocumentEditorDialog] Erro ao carregar template:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar template",
      );
    } finally {
      setLoading(false);
    }
  };

  const updateSigner = (
    index: number,
    field: "name" | "phone" | "email",
    value: string,
  ) => {
    setSigners((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  };

  const addSigner = () => {
    setSigners((prev) => [...prev, { name: "", phone: "", email: "" }]);
  };

  const removeSigner = (index: number) => {
    setSigners((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      setError("Assunto obrigatório");
      return;
    }
    // Validar todos os signatários
    for (let i = 0; i < signers.length; i++) {
      if (!signers[i].name.trim()) {
        setError(`Nome do signatário ${i + 1} obrigatório`);
        return;
      }
      if (!signers[i].phone.trim() || signers[i].phone.length < 10) {
        setError(`Telefone do signatário ${i + 1} inválido`);
        return;
      }
    }

    setSending(true);
    setError("");

    try {
      setSendProgress("Gerando PDF e enviando...");
      const envelope = await createSignEnvelope({
        caseId: caseData.id,
        templateId: selectedTemplate?.id || 0,
        subject,
        htmlContent: isDirectTemplate ? undefined : htmlContent,
        signers: signers.map((s) => ({
          name: s.name,
          phone: s.phone,
          email: s.email || undefined,
        })),
        templateType: selectedTemplate?.template_type || "html",
        waba_config_id: selectedWabaPhoneId || undefined,
        require_otp: requireOtp,
        require_selfie: requireSelfie,
      });

      onEnvelopeCreated(envelope);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSending(false);
      setSendProgress("");
    }
  };

  const handleBack = () => {
    if (step === "sign") {
      setStep(isDirectTemplate ? "select" : "edit");
    } else {
      setStep("select");
    }
  };

  const getTemplateTypeIcon = (t: DocumentTemplateRow) => {
    const tType = t.template_type || "html";
    if (tType === "direct_pdf")
      return <FileText className="h-4 w-4 text-red-500" />;
    if (tType === "direct_docx")
      return <Upload className="h-4 w-4 text-violet-500" />;
    return <FileCode className="h-4 w-4 text-blue-500" />;
  };

  const getTemplateTypeLabel = (t: DocumentTemplateRow) => {
    const tType = t.template_type || "html";
    if (tType === "direct_pdf") return "PDF direto";
    if (tType === "direct_docx") return "DOCX direto";
    return "Editável";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "select" && "Selecionar Modelo"}
            {step === "edit" && "Editar Documento"}
            {step === "sign" && "Enviar para Assinatura"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Step 1: Template selection */}
          {step === "select" && (
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum modelo disponível. Crie um em Configurações &gt;
                    Modelos.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className="text-left p-3 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        {getTemplateTypeIcon(t)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {t.description}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {getTemplateTypeLabel(t)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Document editing (HTML templates only) */}
          {step === "edit" && (
            <RichTextEditor
              content={htmlContent}
              onChange={setHtmlContent}
              availableVariables={ALL_VAR_KEYS}
            />
          )}

          {/* Step 3: Signers info */}
          {step === "sign" && (
            <div className="space-y-4 max-w-lg mx-auto py-4">
              {isDirectTemplate && (
                <div className="text-xs text-foreground/80 bg-muted/50 border border-border/50 rounded-md px-3 py-2 flex items-center gap-2">
                  {getTemplateTypeIcon(selectedTemplate!)}
                  <span>
                    Template direto — o arquivo será enviado sem edição
                    {selectedTemplate?.original_filename && (
                      <> ({selectedTemplate.original_filename})</>
                    )}
                  </span>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Assunto do envelope
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Número WhatsApp (WABA) */}
              {wabaPhones.some((p) => p.riasignWabaConfigId) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Enviar via WhatsApp (escritório)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={selectedWabaPhoneId}
                      onChange={(e) => setSelectedWabaPhoneId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                    >
                      <option value="">Sem envio WhatsApp (apenas link)</option>
                      {wabaPhones
                        .filter((p) => p.riasignWabaConfigId)
                        .map((p) => (
                          <option key={p.configId} value={p.riasignWabaConfigId!}>
                            {p.institutionName || p.label || p.phoneNumber}
                            {p.phoneNumber ? ` (${p.phoneNumber})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Signatários */}
              <div className="space-y-3">
                {signers.map((signer, idx) => (
                  <div
                    key={idx}
                    className="border border-border/60 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Signatário {idx + 1}
                      </span>
                      {signers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSigner(idx)}
                          title="Remover signatário"
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-0.5 block">
                        Nome completo
                      </label>
                      <input
                        type="text"
                        value={signer.name}
                        onChange={(e) =>
                          updateSigner(idx, "name", e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-0.5 block">
                          Telefone (com DDI)
                        </label>
                        <input
                          type="text"
                          value={signer.phone}
                          onChange={(e) =>
                            updateSigner(idx, "phone", e.target.value)
                          }
                          placeholder="+5511999999999"
                          className="w-full px-3 py-1.5 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-0.5 block">
                          Email (opcional)
                        </label>
                        <input
                          type="email"
                          value={signer.email}
                          onChange={(e) =>
                            updateSigner(idx, "email", e.target.value)
                          }
                          className="w-full px-3 py-1.5 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addSigner}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar signatário
                </button>
              </div>

              {/* Opções de verificação */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
                <p className="text-xs font-semibold text-foreground">
                  Verificação do signatário
                </p>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireSelfie}
                    onChange={(e) => setRequireSelfie(e.target.checked)}
                    className="rounded border-border"
                  />
                  Exigir selfie para assinatura
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireOtp}
                    onChange={(e) => setRequireOtp(e.target.checked)}
                    className="rounded border-border"
                  />
                  Exigir código OTP (SMS/WhatsApp)
                </label>
              </div>

              {sendProgress && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {sendProgress}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex justify-between pt-3 border-t border-border">
          <div>
            {step !== "select" && (
              <button
                type="button"
                onClick={handleBack}
                disabled={sending}
                className="flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            )}
          </div>
          <div>
            {step === "edit" && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep("sign");
                }}
                className="flex items-center gap-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {step === "sign" && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar para Assinatura
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

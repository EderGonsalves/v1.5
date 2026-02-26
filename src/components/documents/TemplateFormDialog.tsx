"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "./RichTextEditor";
import { AVAILABLE_VARIABLES } from "@/lib/documents/types";
import type { DocumentTemplateRow } from "@/lib/documents/types";
import { extractVariables } from "@/lib/documents/variables";
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  fetchTemplateWithContent,
  convertDocxFile,
  uploadDocumentTemplate,
} from "@/services/doc-templates-client";
import {
  FileText,
  Upload,
  FileCode,
  Loader2,
  AlertTriangle,
  Check,
  CircleAlert,
  Braces,
} from "lucide-react";

const CATEGORIES = [
  { value: "contrato", label: "Contrato" },
  { value: "procuracao", label: "Procuração" },
  { value: "declaracao", label: "Declaração" },
  { value: "termo", label: "Termo" },
  { value: "outro", label: "Outro" },
];

const ALL_VARIABLE_KEYS = AVAILABLE_VARIABLES.flatMap((g) =>
  g.variables.map((v) => v.key),
);

type CreationMode = "scratch" | "import_docx" | "direct_upload";

type TemplateFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTemplate?: DocumentTemplateRow | null;
  onSaved: (template: DocumentTemplateRow) => void;
};

export function TemplateFormDialog({
  open,
  onOpenChange,
  editTemplate,
  onSaved,
}: TemplateFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("contrato");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Upload state
  const [creationMode, setCreationMode] = useState<CreationMode>("scratch");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editTemplate;
  const isDirectType =
    editTemplate?.template_type === "direct_pdf" ||
    editTemplate?.template_type === "direct_docx";

  // Load edit data
  useEffect(() => {
    if (!open) return;
    setError("");
    setConversionWarnings([]);
    setDetectedVariables([]);
    setUploadFile(null);

    if (editTemplate) {
      setName(editTemplate.name);
      setDescription(editTemplate.description || "");
      // Baserow single select pode retornar objeto { id, value, color }
      const rawCat = editTemplate.category;
      const catValue = typeof rawCat === "object" && rawCat !== null
        ? (rawCat as unknown as { value: string }).value
        : rawCat;
      setCategory(catValue || "contrato");
      setCreationMode("scratch");

      if (!isDirectType) {
        setLoading(true);
        fetchTemplateWithContent(editTemplate.id)
          .then((resp) => {
            const html = resp.htmlContent ?? "";
            setHtmlContent(html);
            if (html) {
              setDetectedVariables(extractVariables(html));
            }
            // Mostrar aviso do servidor se houver
            const warning = (resp as Record<string, unknown>).warning;
            if (warning && typeof warning === "string") {
              setError(warning);
            } else if (!html) {
              setError("Conteúdo HTML vazio — o arquivo do template pode não existir no servidor");
            }
          })
          .catch((err) => {
            console.error("[TemplateFormDialog] Erro ao carregar template:", err);
            setHtmlContent("");
            setError(err instanceof Error ? err.message : "Erro ao carregar template");
          })
          .finally(() => setLoading(false));
      } else {
        setHtmlContent("");
      }
    } else {
      setName("");
      setDescription("");
      setCategory("contrato");
      setHtmlContent("");
      setCreationMode("scratch");
    }
  }, [open, editTemplate, isDirectType]);

  const handleDocxConvert = async (file: File) => {
    setConverting(true);
    setError("");
    setConversionWarnings([]);
    setDetectedVariables([]);
    try {
      const result = await convertDocxFile(file);
      setHtmlContent(result.html);
      setConversionWarnings(result.warnings || []);
      setDetectedVariables(result.variables || []);
      if (!name.trim()) {
        setName(file.name.replace(/\.docx$/i, ""));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao converter DOCX");
    } finally {
      setConverting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);

    if (creationMode === "import_docx") {
      handleDocxConvert(file);
    } else if (creationMode === "direct_upload") {
      if (!name.trim()) {
        setName(file.name.replace(/\.(pdf|docx)$/i, ""));
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Nome obrigatório");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let result: DocumentTemplateRow;

      if (isEditing) {
        // Editing existing template
        const data: Record<string, string | undefined> = {
          name,
          description,
          category,
        };
        if (!isDirectType) {
          if (!htmlContent.trim() || htmlContent.length < 10) {
            setError("Conteúdo do documento obrigatório");
            setSaving(false);
            return;
          }
          data.html_content = htmlContent;
        }
        result = await updateDocumentTemplate(editTemplate!.id, data);
      } else if (creationMode === "direct_upload") {
        // Direct upload (PDF or DOCX as-is)
        if (!uploadFile) {
          setError("Selecione um arquivo para upload");
          setSaving(false);
          return;
        }
        const { template } = await uploadDocumentTemplate({
          file: uploadFile,
          name,
          description,
          category,
          mode: "direct",
        });
        result = template;
      } else if (creationMode === "import_docx" && uploadFile && !htmlContent) {
        // Import DOCX but conversion hasn't happened yet
        setError("Aguarde a conversão do DOCX");
        setSaving(false);
        return;
      } else {
        // Scratch or imported DOCX (both use HTML editor)
        if (!htmlContent.trim() || htmlContent.length < 10) {
          setError("Conteúdo do documento obrigatório");
          setSaving(false);
          return;
        }

        if (creationMode === "import_docx" && uploadFile) {
          // Use upload route for editable mode to preserve original filename
          const { template } = await uploadDocumentTemplate({
            file: uploadFile,
            name,
            description,
            category,
            mode: "editable",
          });
          result = template;
        } else {
          result = await createDocumentTemplate({
            name,
            description,
            category,
            html_content: htmlContent,
          });
        }
      }

      onSaved(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const showEditor = isEditing
    ? !isDirectType
    : creationMode === "scratch" ||
      (creationMode === "import_docx" && htmlContent.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? isDirectType
                ? "Editar Metadados"
                : "Editar Modelo"
              : "Novo Modelo de Documento"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 py-2">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* Creation mode selector (new template only) */}
          {!isEditing && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Como deseja criar o modelo?
              </label>
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  active={creationMode === "scratch"}
                  onClick={() => {
                    setCreationMode("scratch");
                    setUploadFile(null);
                    setHtmlContent("");
                    setConversionWarnings([]);
                    setDetectedVariables([]);
                  }}
                  icon={FileCode}
                  label="Criar do zero"
                  description="Editor visual"
                />
                <ModeButton
                  active={creationMode === "import_docx"}
                  onClick={() => {
                    setCreationMode("import_docx");
                    setUploadFile(null);
                    setHtmlContent("");
                    setConversionWarnings([]);
                    setDetectedVariables([]);
                  }}
                  icon={FileText}
                  label="Importar DOCX"
                  description="Converter e editar"
                />
                <ModeButton
                  active={creationMode === "direct_upload"}
                  onClick={() => {
                    setCreationMode("direct_upload");
                    setUploadFile(null);
                    setHtmlContent("");
                    setConversionWarnings([]);
                    setDetectedVariables([]);
                  }}
                  icon={Upload}
                  label="Upload direto"
                  description="PDF ou DOCX"
                />
              </div>
            </div>
          )}

          {/* Metadata fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Nome do modelo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Contrato de Prestação de Serviços"
                className="w-full px-3 py-2 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descrição do modelo"
              className="w-full px-3 py-2 text-sm text-foreground border border-border rounded-md bg-background dark:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* File upload area (import_docx or direct_upload) */}
          {!isEditing &&
            (creationMode === "import_docx" ||
              creationMode === "direct_upload") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {creationMode === "import_docx"
                    ? "Arquivo DOCX"
                    : "Arquivo PDF ou DOCX"}
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                >
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {uploadFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({(uploadFile.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-1" />
                      <p className="text-sm text-muted-foreground">
                        Clique para selecionar{" "}
                        {creationMode === "import_docx"
                          ? "um arquivo .docx"
                          : "um arquivo .pdf ou .docx"}
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    creationMode === "import_docx"
                      ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      : ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  }
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

          {/* Converting indicator */}
          {converting && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Convertendo DOCX para HTML...
            </div>
          )}

          {/* Conversion warnings */}
          {conversionWarnings.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3 w-3" />
                Avisos de conversão:
              </div>
              {conversionWarnings.slice(0, 5).map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              {conversionWarnings.length > 5 && (
                <p>...e mais {conversionWarnings.length - 5} aviso(s)</p>
              )}
            </div>
          )}

          {/* Detected variables (from DOCX import or loaded template) */}
          {detectedVariables.length > 0 && (creationMode === "import_docx" || isEditing) && (
            <DetectedVariablesPanel variables={detectedVariables} />
          )}

          {/* Editor (scratch, import_docx after conversion, or editing HTML template) */}
          {showEditor && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Conteúdo do documento
              </label>
              {loading ? (
                <div className="flex items-center justify-center h-40 border border-border rounded-lg bg-muted/20">
                  <span className="text-sm text-muted-foreground">
                    Carregando...
                  </span>
                </div>
              ) : (
                <RichTextEditor
                  content={htmlContent}
                  onChange={setHtmlContent}
                  availableVariables={ALL_VARIABLE_KEYS}
                />
              )}
            </div>
          )}

          {/* Direct upload info */}
          {isEditing && isDirectType && (
            <div className="text-xs text-foreground/80 bg-muted/50 border border-border/50 rounded-md px-3 py-2">
              Este modelo é um upload direto ({editTemplate?.template_type === "direct_pdf" ? "PDF" : "DOCX"}).
              O conteúdo do arquivo não pode ser editado.
              {editTemplate?.original_filename && (
                <span className="block mt-1 text-muted-foreground">
                  Arquivo original: {editTemplate.original_filename}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || converting}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving
              ? "Salvando..."
              : isEditing
                ? "Salvar"
                : creationMode === "direct_upload"
                  ? "Fazer Upload"
                  : "Criar Modelo"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mode button helper
// ---------------------------------------------------------------------------

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-editor-btn=""
      data-active={active ? "true" : undefined}
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{description}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detected variables panel — shows recognized vs unknown variables from DOCX
// ---------------------------------------------------------------------------

function DetectedVariablesPanel({ variables }: { variables: string[] }) {
  const recognized = variables.filter((v) =>
    ALL_VARIABLE_KEYS.includes(v),
  );
  const unknown = variables.filter(
    (v) => !ALL_VARIABLE_KEYS.includes(v),
  );

  // Find human-readable label for a recognized variable
  const getLabel = (key: string): string => {
    for (const group of AVAILABLE_VARIABLES) {
      const found = group.variables.find((v) => v.key === key);
      if (found) return found.label;
    }
    return key;
  };

  return (
    <div className="rounded-md border border-border px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Braces className="h-3.5 w-3.5 text-primary" />
        Variáveis detectadas no documento ({variables.length})
      </div>

      {recognized.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Reconhecidas ({recognized.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recognized.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
              >
                <Check className="h-3 w-3" />
                {getLabel(v)}
                <code className="text-[9px] opacity-70 ml-0.5">{`{{${v}}}`}</code>
              </span>
            ))}
          </div>
        </div>
      )}

      {unknown.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Não reconhecidas ({unknown.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unknown.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
              >
                <CircleAlert className="h-3 w-3" />
                <code className="text-[9px]">{`{{${v}}}`}</code>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Variáveis não reconhecidas não serão substituídas automaticamente.
          </p>
        </div>
      )}

      {recognized.length > 0 && unknown.length === 0 && (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
          Todas as variáveis serão preenchidas automaticamente ao gerar o documento.
        </p>
      )}
    </div>
  );
}

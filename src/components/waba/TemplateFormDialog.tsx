"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplatePreview } from "./TemplatePreview";
import type { TemplateComponent, TemplateButton } from "@/lib/waba/schemas";
import { Loader2, Plus, Trash2 } from "lucide-react";

type TemplateFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    category: string;
    language: string;
    components: TemplateComponent[];
  }) => Promise<void>;
};

const CATEGORIES = [
  { value: "UTILITY", label: "Utilitário" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AUTHENTICATION", label: "Autenticação" },
];

const LANGUAGES = [
  { value: "pt_BR", label: "Português (BR)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Español" },
];

const BUTTON_TYPES = [
  { value: "QUICK_REPLY", label: "Resposta rápida" },
  { value: "URL", label: "URL" },
  { value: "PHONE_NUMBER", label: "Telefone" },
] as const;

type ButtonForm = {
  type: TemplateButton["type"];
  text: string;
  url: string;
  phone_number: string;
};

const emptyButton: ButtonForm = {
  type: "QUICK_REPLY",
  text: "",
  url: "",
  phone_number: "",
};

export const TemplateFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
}: TemplateFormDialogProps) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("pt_BR");
  const [headerEnabled, setHeaderEnabled] = useState(false);
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerEnabled, setFooterEnabled] = useState(false);
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewComponents = useMemo((): TemplateComponent[] => {
    const comps: TemplateComponent[] = [];
    if (headerEnabled && headerText.trim()) {
      comps.push({ type: "HEADER", format: "TEXT", text: headerText });
    }
    if (bodyText.trim()) {
      comps.push({ type: "BODY", text: bodyText });
    }
    if (footerEnabled && footerText.trim()) {
      comps.push({ type: "FOOTER", text: footerText });
    }
    if (buttons.length > 0) {
      const validButtons: TemplateButton[] = buttons
        .filter((b) => b.text.trim())
        .map((b) => ({
          type: b.type,
          text: b.text,
          ...(b.type === "URL" && b.url ? { url: b.url } : {}),
          ...(b.type === "PHONE_NUMBER" && b.phone_number
            ? { phone_number: b.phone_number }
            : {}),
        }));
      if (validButtons.length > 0) {
        comps.push({ type: "BUTTONS", buttons: validButtons });
      }
    }
    return comps;
  }, [headerEnabled, headerText, bodyText, footerEnabled, footerText, buttons]);

  const nameNormalized = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  /** Extrai números de variáveis {{1}}, {{2}} etc. de um texto */
  const extractVarNumbers = (text: string): number[] => {
    const nums = new Set<number>();
    for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
      nums.add(Number(m[1]));
    }
    return Array.from(nums).sort((a, b) => a - b);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!nameNormalized) {
      setError("Nome é obrigatório");
      return;
    }
    if (!bodyText.trim()) {
      setError("O corpo da mensagem é obrigatório");
      return;
    }

    const components: TemplateComponent[] = [];

    // Header — com example se tiver variáveis
    if (headerEnabled && headerText.trim()) {
      const headerVars = extractVarNumbers(headerText);
      const headerComp: TemplateComponent = { type: "HEADER", format: "TEXT", text: headerText };
      if (headerVars.length > 0) {
        headerComp.example = {
          header_text: headerVars.map((n) => `exemplo_${n}`),
        };
      }
      components.push(headerComp);
    }

    // Body — com example se tiver variáveis (obrigatório pela Meta)
    const bodyVars = extractVarNumbers(bodyText);
    const bodyComp: TemplateComponent = { type: "BODY", text: bodyText };
    if (bodyVars.length > 0) {
      bodyComp.example = {
        body_text: [bodyVars.map((n) => `exemplo_${n}`)],
      };
    }
    components.push(bodyComp);

    if (footerEnabled && footerText.trim()) {
      components.push({ type: "FOOTER", text: footerText });
    }
    if (buttons.length > 0) {
      const validButtons: TemplateButton[] = buttons
        .filter((b) => b.text.trim())
        .map((b) => ({
          type: b.type,
          text: b.text,
          ...(b.type === "URL" && b.url ? { url: b.url } : {}),
          ...(b.type === "PHONE_NUMBER" && b.phone_number
            ? { phone_number: b.phone_number }
            : {}),
        }));
      if (validButtons.length > 0) {
        components.push({ type: "BUTTONS", buttons: validButtons });
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: nameNormalized,
        category,
        language,
        components,
      });
      // Reset form
      setName("");
      setCategory("UTILITY");
      setLanguage("pt_BR");
      setHeaderEnabled(false);
      setHeaderText("");
      setBodyText("");
      setFooterEnabled(false);
      setFooterText("");
      setButtons([]);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar template",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { ...emptyButton }]);
  };

  const removeButton = (idx: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateButton = (idx: number, field: keyof ButtonForm, value: string) => {
    setButtons((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Template</DialogTitle>
          <DialogDescription>
            Crie um modelo de mensagem para enviar ao WhatsApp. Após enviar, o
            template será analisado pela Meta (pode levar de 30min a 24h).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
          {/* Form Column */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome do template</Label>
              <Input
                id="tpl-name"
                placeholder="ex: boas_vindas_cliente"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={512}
              />
              {name && nameNormalized !== name && (
                <p className="text-[11px] text-muted-foreground">
                  Será salvo como: <span className="font-mono">{nameNormalized}</span>
                </p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Categoria</Label>
              <select
                id="tpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-language">Idioma</Label>
              <select
                id="tpl-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Header */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tpl-header-toggle"
                  checked={headerEnabled}
                  onChange={(e) => setHeaderEnabled(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="tpl-header-toggle">Header (opcional)</Label>
              </div>
              {headerEnabled && (
                <div>
                  <Input
                    placeholder="Texto do header (max 60 chars)"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    maxLength={60}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5 text-right">
                    {headerText.length}/60
                  </p>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">
                Corpo da mensagem *
              </Label>
              <Textarea
                id="tpl-body"
                placeholder={'Olá {{1}}, bem-vindo ao escritório {{2}}!\n\nUse {{1}}, {{2}} para variáveis.'}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                maxLength={1024}
                rows={5}
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {bodyText.length}/1024
              </p>
            </div>

            {/* Footer */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tpl-footer-toggle"
                  checked={footerEnabled}
                  onChange={(e) => setFooterEnabled(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="tpl-footer-toggle">Footer (opcional)</Label>
              </div>
              {footerEnabled && (
                <div>
                  <Input
                    placeholder="Texto do footer (max 60 chars)"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    maxLength={60}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5 text-right">
                    {footerText.length}/60
                  </p>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botões (opcional, max 3)</Label>
                {buttons.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addButton}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Botão
                  </Button>
                )}
              </div>
              {buttons.map((btn, idx) => (
                <div
                  key={idx}
                  className="space-y-1.5 rounded-md border p-2 relative"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 text-destructive"
                    onClick={() => removeButton(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <select
                    value={btn.type}
                    onChange={(e) =>
                      updateButton(idx, "type", e.target.value)
                    }
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm"
                  >
                    {BUTTON_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Texto do botão (max 20 chars)"
                    value={btn.text}
                    onChange={(e) => updateButton(idx, "text", e.target.value)}
                    maxLength={20}
                    className="h-8 text-xs"
                  />
                  {btn.type === "URL" && (
                    <Input
                      placeholder="https://exemplo.com"
                      value={btn.url}
                      onChange={(e) =>
                        updateButton(idx, "url", e.target.value)
                      }
                      className="h-8 text-xs"
                    />
                  )}
                  {btn.type === "PHONE_NUMBER" && (
                    <Input
                      placeholder="+5511999999999"
                      value={btn.phone_number}
                      onChange={(e) =>
                        updateButton(idx, "phone_number", e.target.value)
                      }
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview Column */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-4 min-h-[200px]">
              {previewComponents.length > 0 ? (
                <TemplatePreview components={previewComponents} />
              ) : (
                <p className="text-xs text-center text-muted-foreground mt-8">
                  Preencha os campos para ver o preview
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Criar Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

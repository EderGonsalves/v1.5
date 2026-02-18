"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplatePreview } from "./TemplatePreview";
import type { Template } from "@/lib/waba/schemas";
import { Loader2, Search, Send } from "lucide-react";

type TemplateSendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: number;
  to: string;
  wabaPhoneNumber: string;
  onSent?: () => void;
};

/** Extract variable numbers from template body text, e.g. {{1}}, {{2}} */
const extractVariables = (template: Template): string[] => {
  const vars = new Set<string>();
  for (const comp of template.components) {
    if (comp.text) {
      const matches = comp.text.matchAll(/\{\{(\d+)\}\}/g);
      for (const m of matches) {
        vars.add(m[1]);
      }
    }
  }
  return Array.from(vars).sort((a, b) => Number(a) - Number(b));
};

export const TemplateSendDialog = ({
  open,
  onOpenChange,
  caseId,
  to,
  wabaPhoneNumber,
  onSent,
}: TemplateSendDialogProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchApproved = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/waba/templates?status=APPROVED");
      if (!res.ok) throw new Error("Erro ao buscar templates");
      const data = await res.json();
      setTemplates(data.data ?? []);
    } catch {
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchApproved();
      setSelectedTemplate(null);
      setVariableValues({});
      setError(null);
      setSearchQuery("");
    }
  }, [open, fetchApproved]);

  const variables = useMemo(
    () => (selectedTemplate ? extractVariables(selectedTemplate) : []),
    [selectedTemplate],
  );

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.components.some(
          (c) => c.text && c.text.toLowerCase().includes(q),
        ),
    );
  }, [templates, searchQuery]);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setVariableValues({});
    setError(null);
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setError(null);

    // Build components with parameters
    const bodyVars = variables.filter((v) => {
      const bodyComp = selectedTemplate.components.find(
        (c) => c.type === "BODY",
      );
      return bodyComp?.text?.includes(`{{${v}}}`);
    });

    const templateComponents: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }> = [];

    if (bodyVars.length > 0) {
      templateComponents.push({
        type: "body",
        parameters: bodyVars.map((v) => ({
          type: "text",
          text: variableValues[v] || `{{${v}}}`,
        })),
      });
    }

    // Check for header variables
    const headerComp = selectedTemplate.components.find(
      (c) => c.type === "HEADER",
    );
    if (headerComp?.text) {
      const headerMatches = headerComp.text.matchAll(/\{\{(\d+)\}\}/g);
      const headerVarNums = Array.from(headerMatches).map((m) => m[1]);
      if (headerVarNums.length > 0) {
        templateComponents.push({
          type: "header",
          parameters: headerVarNums.map((v) => ({
            type: "text",
            text: variableValues[v] || `{{${v}}}`,
          })),
        });
      }
    }

    // Build resolved template text for message logging
    let resolvedText = "";
    const bodyComp = selectedTemplate.components.find((c) => c.type === "BODY");
    if (bodyComp?.text) {
      resolvedText = bodyComp.text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
        return variableValues[num] || `{{${num}}}`;
      });
    }
    const headerComp2 = selectedTemplate.components.find((c) => c.type === "HEADER");
    if (headerComp2?.text) {
      const headerText = headerComp2.text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
        return variableValues[num] || `{{${num}}}`;
      });
      resolvedText = resolvedText ? `${headerText}\n${resolvedText}` : headerText;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/v1/waba/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          to,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          components: templateComponents.length > 0 ? templateComponents : undefined,
          wabaPhoneNumber,
          resolvedText: resolvedText || selectedTemplate.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }

      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar template");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Template</DialogTitle>
          <DialogDescription>
            Selecione um template aprovado para enviar para {to}
          </DialogDescription>
        </DialogHeader>

        {!selectedTemplate ? (
          /* Template selection step */
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum template aprovado encontrado
              </p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-1">
                {filteredTemplates.map((tpl) => {
                  const bodyText =
                    tpl.components.find((c) => c.type === "BODY")?.text ?? "";
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl)}
                      className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono">
                          {tpl.name}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {tpl.language}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {bodyText}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Fill variables + preview step */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTemplate(null)}
                className="text-xs"
              >
                &larr; Voltar à lista
              </Button>

              <div>
                <p className="text-sm font-semibold font-mono">
                  {selectedTemplate.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedTemplate.language}
                </p>
              </div>

              {variables.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Preencha as variáveis</Label>
                  {variables.map((v) => (
                    <div key={v} className="space-y-1">
                      <Label
                        htmlFor={`var-${v}`}
                        className="text-xs text-muted-foreground"
                      >
                        {`{{${v}}}`}
                      </Label>
                      <Input
                        id={`var-${v}`}
                        placeholder={`Valor para {{${v}}}`}
                        value={variableValues[v] ?? ""}
                        onChange={(e) =>
                          setVariableValues((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-4 min-h-[150px]">
                <TemplatePreview
                  components={selectedTemplate.components}
                  variableValues={variableValues}
                />
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancelar
          </Button>
          {selectedTemplate && (
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Template
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

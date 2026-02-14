"use client";

import { useState } from "react";
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
import { TemplateSendDialog } from "./TemplateSendDialog";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";

type NewConversationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wabaPhoneNumber: string;
  onConversationStarted?: (caseId: number) => void;
};

export const NewConversationDialog = ({
  open,
  onOpenChange,
  wabaPhoneNumber,
  onConversationStarted,
}: NewConversationDialogProps) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state: case created
  const [createdCaseId, setCreatedCaseId] = useState<number | null>(null);
  const [showTemplateSend, setShowTemplateSend] = useState(false);

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setIsCreating(false);
    setError(null);
    setCreatedCaseId(null);
    setShowTemplateSend(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleCreateCase = async () => {
    setError(null);

    if (!customerName.trim()) {
      setError("Nome do cliente é obrigatório");
      return;
    }
    if (!customerPhone.trim()) {
      setError("Telefone do cliente é obrigatório");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/v1/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      const caseId = data.id ?? data.caseId ?? data.case?.id;
      if (!caseId) {
        throw new Error("Caso criado mas ID não retornado");
      }
      setCreatedCaseId(caseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar caso");
    } finally {
      setIsCreating(false);
    }
  };

  const handleTemplateSent = () => {
    setShowTemplateSend(false);
    onConversationStarted?.(createdCaseId!);
    handleClose(false);
  };

  return (
    <>
      <Dialog open={open && !showTemplateSend} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5" />
              Nova Conversa
            </DialogTitle>
            <DialogDescription>
              {createdCaseId
                ? "Caso criado com sucesso! Envie um template para iniciar a conversa."
                : "Crie um novo caso para iniciar uma conversa pelo WhatsApp."}
            </DialogDescription>
          </DialogHeader>

          {!createdCaseId ? (
            /* Step 1: Create case */
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="nc-name">Nome do cliente</Label>
                <Input
                  id="nc-name"
                  placeholder="Nome completo"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-phone">Telefone</Label>
                <Input
                  id="nc-phone"
                  placeholder="+5511999999999"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          ) : (
            /* Step 2: Case created */
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-green-50 dark:bg-green-900/10 p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h4 className="mt-2 text-sm font-semibold">Caso criado</h4>
                <p className="text-xs text-muted-foreground">
                  {customerName} &bull; {customerPhone}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            {!createdCaseId ? (
              <Button onClick={handleCreateCase} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Caso"
                )}
              </Button>
            ) : (
              <Button onClick={() => setShowTemplateSend(true)}>
                <Send className="mr-2 h-4 w-4" />
                Iniciar Conversa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template send dialog (opens on top) */}
      {createdCaseId && (
        <TemplateSendDialog
          open={showTemplateSend}
          onOpenChange={setShowTemplateSend}
          caseId={createdCaseId}
          to={customerPhone}
          wabaPhoneNumber={wabaPhoneNumber}
          onSent={handleTemplateSent}
        />
      )}
    </>
  );
};

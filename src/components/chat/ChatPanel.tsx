"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { ArrowLeft, Loader2, MessageSquarePlus, MoreVertical, Phone, RefreshCw, User, UserRoundCog } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ContactPanel } from "@/components/chat/ContactPanel";
import { KanbanCardDetail } from "@/components/kanban/KanbanCardDetail";
import { useCaseChat, type CaseSummary } from "@/hooks/use-case-chat";
import { cn } from "@/lib/utils";
import { updateBaserowCase, type BaserowCaseRow } from "@/services/api";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useUsers } from "@/hooks/use-users";
import { notifyTransferWebhook } from "@/services/transfer-notify";
import type { Conversation } from "@/hooks/use-conversations";
import type { WabaNumber } from "@/hooks/use-waba-numbers";

type ChatPanelProps = {
  caseRowId: number;
  conversation: Conversation;
  onBack?: () => void;
  /** Número WABA que será usado para enviar mensagens */
  activeWabaNumber?: string | null;
  /** Lista de números WABA disponíveis */
  wabaNumbers?: WabaNumber[];
  /** Callback para abrir dialog de nova conversa */
  onNewConversation?: () => void;
};

const formatWabaPhoneForDisplay = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9);
    return `(${ddd}) ${part1}-${part2}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 8);
    const part2 = digits.slice(8);
    return `(${ddd}) ${part1}-${part2}`;
  }
  return phone;
};

const formatRelativeTime = (value?: string | null): string => {
  if (!value) {
    return "Nunca";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Desconhecido";
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) {
    return "online";
  }
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `visto por último há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `visto por último há ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `visto por último há ${days}d`;
};

export const ChatPanel = ({
  caseRowId,
  conversation,
  onBack,
  activeWabaNumber,
  wabaNumbers = [],
  onNewConversation,
}: ChatPanelProps) => {
  const hasMultipleWaba = wabaNumbers.length > 1;

  const initialCase: CaseSummary = {
    id: conversation.id,
    caseIdentifier: conversation.caseId,
    customerName: conversation.customerName,
    customerPhone: conversation.customerPhone,
    paused: conversation.paused,
    bjCaseId: conversation.bjCaseId,
  };

  const {
    messages,
    caseSummary,
    meta,
    isLoading,
    isRefreshing,
    isSending,
    error,
    refresh,
    sendMessage,
    setPausedState,
  } = useCaseChat(caseRowId, { initialCase });

  // Número WABA efetivo: prioriza o número da conversa (das mensagens), depois o selecionado
  const effectiveWabaNumber = useMemo(() => {
    // Primeiro: usa o número determinado das mensagens da conversa
    if (caseSummary?.wabaPhoneNumber) {
      return caseSummary.wabaPhoneNumber;
    }
    // Segundo: usa o número passado via prop (filtro selecionado)
    if (activeWabaNumber) {
      return activeWabaNumber;
    }
    // Terceiro: usa o primeiro número disponível
    if (wabaNumbers.length > 0) {
      return wabaNumbers[0].phoneNumber.replace(/\D/g, "");
    }
    return null;
  }, [caseSummary?.wabaPhoneNumber, activeWabaNumber, wabaNumbers]);

  // Encontrar o label do número WABA ativo
  const activeWabaLabel = useMemo(() => {
    if (!effectiveWabaNumber || !hasMultipleWaba) return null;
    const normalized = effectiveWabaNumber.replace(/\D/g, "");
    const found = wabaNumbers.find(
      (num) => num.phoneNumber.replace(/\D/g, "") === normalized
    );
    return found?.label || formatWabaPhoneForDisplay(effectiveWabaNumber);
  }, [effectiveWabaNumber, wabaNumbers, hasMultipleWaba]);

  const [isUpdatingPause, setIsUpdatingPause] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  // Contact panel + case detail
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [detailCase, setDetailCase] = useState<BaserowCaseRow | null>(null);

  // Transfer feature
  const { data: onbData } = useOnboarding();
  const { users: institutionUsers } = useUsers(onbData.auth?.institutionId);
  const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [transferValue, setTransferValue] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const transferRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!showTransferPanel) return;
    const handler = (e: MouseEvent) => {
      if (transferRef.current && !transferRef.current.contains(e.target as Node)) {
        setShowTransferPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTransferPanel]);

  const handleTransfer = useCallback(async () => {
    if (!transferValue || !caseSummary) return;
    setIsTransferring(true);
    try {
      await updateBaserowCase(caseSummary.id, { responsavel: transferValue });

      // Notify webhook
      const targetUser = institutionUsers.find((u) => u.name === transferValue);
      if (targetUser) {
        notifyTransferWebhook({
          type: "transfer",
          user: targetUser,
          caseInfo: {
            id: caseSummary.id,
            caseId: caseSummary.caseIdentifier,
            customerName: caseSummary.customerName,
            customerPhone: caseSummary.customerPhone,
            bjCaseId: caseSummary.bjCaseId ?? undefined,
            institutionId: onbData.auth?.institutionId,
            responsavel: transferValue,
          },
        });
      }

      setTransferSuccess(true);
      setTimeout(() => {
        setTransferSuccess(false);
        setShowTransferPanel(false);
        setTransferValue("");
      }, 1500);
    } catch (err) {
      console.error("Erro ao transferir:", err);
    } finally {
      setIsTransferring(false);
    }
  }, [transferValue, caseSummary, institutionUsers, onbData.auth?.institutionId]);

  const windowInfo = useMemo(() => {
    const lastClientAt = meta?.lastClientMessageAt ?? null;
    const deadline = meta?.sessionDeadline ? new Date(meta.sessionDeadline) : null;
    const isExpired = deadline ? deadline.getTime() <= Date.now() : true;
    return {
      lastClientAt,
      isExpired,
      label: formatRelativeTime(lastClientAt),
      deadlineLabel: deadline
        ? deadline.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : null,
    };
  }, [meta?.lastClientMessageAt, meta?.sessionDeadline]);

  const handlePauseToggle = async (nextState: boolean) => {
    if (!caseSummary) return;
    setPauseError(null);
    setIsUpdatingPause(true);
    try {
      await updateBaserowCase(caseSummary.id, {
        IApause: nextState ? "SIM" : "",
      });
      setPausedState(nextState);
    } catch (error) {
      setPauseError(
        error instanceof Error ? error.message : "Erro ao atualizar pausa da IA",
      );
    } finally {
      setIsUpdatingPause(false);
    }
  };

  const contactInstitutionId = onbData.auth?.institutionId ?? 0;

  return (
    <div className="flex h-full">
      {/* Main chat column */}
      <div className={cn("flex flex-col bg-muted/30", showContactPanel ? "flex-1 min-w-0" : "w-full")}>
      {/* Header */}
      <header className="flex items-center gap-3 bg-card border-b px-4 py-2 shadow-sm">
        {/* Back button - mobile only */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* Avatar - clickable */}
        <button
          type="button"
          onClick={() => setShowContactPanel(true)}
          className="relative h-10 w-10 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          {windowInfo.label === "online" && (
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
          )}
        </button>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <h1
            role="button"
            tabIndex={0}
            onClick={() => setShowContactPanel(true)}
            onKeyDown={(e) => { if (e.key === "Enter") setShowContactPanel(true); }}
            className="text-[17px] font-medium text-foreground truncate cursor-pointer hover:underline"
          >
            {caseSummary?.customerName ?? conversation.customerName}
          </h1>
          <p className="text-[13px] text-muted-foreground truncate">
            {windowInfo.lastClientAt ? windowInfo.label : "offline"}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 text-[#1B263B] dark:text-[#D4E0EB]">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="p-2 hover:bg-[#D4E0EB] dark:hover:bg-[#263850] rounded-full transition-colors"
            title="Atualizar"
          >
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </button>
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="p-2 hover:bg-[#D4E0EB] dark:hover:bg-[#263850] rounded-full transition-colors"
              title="Nova conversa"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          )}
          <div className="relative" ref={transferRef}>
            <button
              type="button"
              onClick={() => setShowTransferPanel((v) => !v)}
              className="p-2 hover:bg-[#D4E0EB] dark:hover:bg-[#263850] rounded-full transition-colors"
              title="Transferir atendimento"
            >
              <UserRoundCog className="h-5 w-5" />
            </button>
            {showTransferPanel && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border bg-card p-3 shadow-lg">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Transferir para
                </p>
                <select
                  value={transferValue}
                  onChange={(e) => setTransferValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mb-2"
                >
                  <option value="">Selecione o responsável</option>
                  {institutionUsers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={!transferValue || isTransferring}
                  className={cn(
                    "w-full h-8 rounded-md text-xs font-medium transition-colors",
                    transferSuccess
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  )}
                >
                  {isTransferring ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
                  ) : transferSuccess ? (
                    "Transferido!"
                  ) : (
                    "Transferir"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <div className="flex items-center justify-between bg-card border-b px-4 py-1.5 text-xs flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Tel: {caseSummary?.customerPhone ?? conversation.customerPhone}
          </span>
          {(caseSummary?.bjCaseId || conversation.bjCaseId) && (
            <>
              <span className="text-muted-foreground">|</span>
              <a
                href={`https://app.riasistemas.com.br/case/edit/${caseSummary?.bjCaseId ?? conversation.bjCaseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              >
                Abrir caso #{caseSummary?.bjCaseId ?? conversation.bjCaseId}
              </a>
            </>
          )}
          {/* Indicador do número WABA ativo - só aparece quando há múltiplos números */}
          {hasMultipleWaba && activeWabaLabel && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Phone className="h-3 w-3" />
                Enviando de: {activeWabaLabel}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
              windowInfo.isExpired
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/10 text-emerald-600"
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              windowInfo.isExpired ? "bg-destructive" : "bg-emerald-500"
            )} />
            {windowInfo.isExpired ? "Fora da janela 24h" : "Janela ativa"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Bot:</span>
            <Switch
              checked={caseSummary?.paused ?? conversation.paused}
              onCheckedChange={handlePauseToggle}
              disabled={isUpdatingPause}
            />
            <span className={cn(
              "text-[11px] font-medium",
              (caseSummary?.paused ?? conversation.paused) ? "text-amber-500" : "text-emerald-500"
            )}>
              {(caseSummary?.paused ?? conversation.paused) ? "Pausado" : "Ativo"}
            </span>
          </div>
          {pauseError && (
            <span className="text-[11px] text-destructive">{pauseError}</span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/40">
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          className="h-full"
        />
      </div>

      {/* Composer */}
      <div className="bg-card px-4 py-2 border-t">
        <ChatComposer
          onSend={sendMessage}
          isSending={isSending}
          disabled={isUpdatingPause || !caseSummary}
          wabaPhoneNumber={effectiveWabaNumber}
          isWindowClosed={windowInfo.isExpired}
        />
      </div>
      </div>{/* end main chat column */}

      {/* Contact side panel */}
      {showContactPanel && (
        <div className="hidden w-80 shrink-0 lg:block">
          <ContactPanel
            caseRowId={caseRowId}
            customerName={caseSummary?.customerName ?? conversation.customerName}
            customerPhone={caseSummary?.customerPhone ?? conversation.customerPhone}
            institutionId={contactInstitutionId}
            onClose={() => setShowContactPanel(false)}
            onOpenCaseDetail={(caseData) => {
              setDetailCase(caseData);
            }}
          />
        </div>
      )}

      {/* Mobile: overlay panel */}
      {showContactPanel && (
        <div className="absolute inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowContactPanel(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm">
            <ContactPanel
              caseRowId={caseRowId}
              customerName={caseSummary?.customerName ?? conversation.customerName}
              customerPhone={caseSummary?.customerPhone ?? conversation.customerPhone}
              institutionId={contactInstitutionId}
              onClose={() => setShowContactPanel(false)}
              onOpenCaseDetail={(caseData) => {
                setDetailCase(caseData);
              }}
            />
          </div>
        </div>
      )}

      {/* Case detail dialog */}
      <KanbanCardDetail
        caseData={detailCase}
        open={!!detailCase}
        onOpenChange={(open) => {
          if (!open) setDetailCase(null);
        }}
      />
    </div>
  );
};

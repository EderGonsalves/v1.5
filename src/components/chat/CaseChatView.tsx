"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, MoreVertical, RefreshCw, Search, User } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { useCaseChat, type CaseSummary } from "@/hooks/use-case-chat";
import { cn } from "@/lib/utils";
import { updateBaserowCase } from "@/services/api";

type CaseChatViewProps = {
  caseRowId: number;
  initialCase: CaseSummary;
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

export const CaseChatView = ({ caseRowId, initialCase }: CaseChatViewProps) => {
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
  const [isUpdatingPause, setIsUpdatingPause] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-muted/30">
      {/* Header - WhatsApp structure with theme colors */}
      <header className="flex items-center gap-3 bg-card border-b px-4 py-2 shadow-sm">
        <Link
          href="/casos"
          className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {/* Avatar */}
        <div className="relative h-10 w-10 shrink-0">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          {windowInfo.label === "online" && (
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
          )}
        </div>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-medium text-foreground truncate">
            {caseSummary?.customerName ?? "Cliente"}
          </h1>
          <p className="text-[13px] text-muted-foreground truncate">
            {windowInfo.lastClientAt ? windowInfo.label : "offline"}
          </p>
        </div>

        {/* Header Actions */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href="/casos"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            title="Atualizar"
          >
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </button>
          <button type="button" className="p-2 hover:bg-muted rounded-full transition-colors">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Status Bar */}
      <div className="flex items-center justify-between bg-card border-b px-4 py-1.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Tel: {caseSummary?.customerPhone ?? "Não informado"}
          </span>
          {caseSummary?.bjCaseId && (
            <>
              <span className="text-muted-foreground">|</span>
              <a
                href={`https://app.riasistemas.com.br/case/edit/${caseSummary.bjCaseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              >
                Abrir caso #{caseSummary.bjCaseId}
              </a>
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
              checked={caseSummary?.paused ?? false}
              onCheckedChange={handlePauseToggle}
              disabled={isUpdatingPause}
            />
            <span className={cn(
              "text-[11px] font-medium",
              caseSummary?.paused ? "text-amber-500" : "text-emerald-500"
            )}>
              {caseSummary?.paused ? "Pausado" : "Ativo"}
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
          isWindowClosed={windowInfo.isExpired}
        />
      </div>
    </div>
  );
};

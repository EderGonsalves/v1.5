"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CaseMessage,
  SendCaseMessagePayload,
} from "@/lib/chat/types";

export type CaseSummary = {
  id: number;
  caseIdentifier: string | number;
  customerName: string;
  customerPhone: string;
  paused: boolean;
  bjCaseId?: string | number | null;
};

export type ChatMeta = {
  total: number;
  lastClientMessageAt: string | null;
  lastMessageAt: string | null;
  sessionDeadline: string | null;
  legacyFallbackUsed?: boolean;
};

type ChatFetchResponse = {
  case: CaseSummary;
  messages: CaseMessage[];
  meta: ChatMeta;
};

type SendMessageResponse = {
  message: CaseMessage;
  case?: Partial<CaseSummary>;
  meta?: Partial<ChatMeta>;
};

const DEFAULT_META: ChatMeta = {
  total: 0,
  lastClientMessageAt: null,
  lastMessageAt: null,
  sessionDeadline: null,
};

const parsePollInterval = (): number => {
  const raw = process.env.NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS;
  if (!raw) return 10000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 5000 ? parsed : 10000;
};

export const useCaseChat = (
  caseRowId: number,
  options?: { initialCase?: CaseSummary },
) => {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(
    options?.initialCase ?? null,
  );
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollInterval = useMemo(parsePollInterval, []);
  const isSendingRef = useRef(false);

  const updateMeta = useCallback((updater: (prev: ChatMeta) => ChatMeta) => {
    setMeta((prev) => updater(prev ?? DEFAULT_META));
  }, []);

  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/cases/${caseRowId}/messages`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Erro ao carregar mensagens");
          throw new Error(errorText || "Erro ao buscar mensagens do caso");
        }

        const data = (await response.json()) as ChatFetchResponse;
        setMessages(data.messages);
        setCaseSummary(data.case);
        setMeta(data.meta);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Erro desconhecido ao carregar o chat",
        );
      } finally {
        if (options?.silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [caseRowId],
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!pollInterval) return undefined;
    const intervalId = window.setInterval(() => {
      fetchMessages({ silent: true }).catch(() => null);
    }, pollInterval);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchMessages, pollInterval]);

  const sendMessage = useCallback(
    async (payload: SendCaseMessagePayload) => {
      // Use ref to prevent multiple concurrent calls (state check can be bypassed due to async nature)
      if (isSendingRef.current) {
        return null;
      }
      if (!payload.content && !payload.attachments?.length) {
        throw new Error("Informe uma mensagem ou anexo para enviar.");
      }

      isSendingRef.current = true;
      setIsSending(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("sender", payload.sender ?? "agente");
        if (payload.content) {
          formData.append("content", payload.content);
        }
        if (payload.kind) {
          formData.append("kind", payload.kind);
        }
        if (payload.quotedMessageId) {
          formData.append("quotedMessageId", String(payload.quotedMessageId));
        }
        payload.attachments?.forEach((file) => {
          formData.append("attachments", file);
        });

        const response = await fetch(`/api/cases/${caseRowId}/messages`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const serverMessage =
            (errorBody && (errorBody.message as string)) ||
            (errorBody && (errorBody.error as string)) ||
            response.statusText;
          throw new Error(serverMessage || "Erro ao enviar mensagem");
        }

        const result = (await response.json()) as SendMessageResponse;
        setMessages((prev) => [...prev, result.message]);
        updateMeta((prev) => {
          const next: ChatMeta = {
            ...prev,
            total: prev.total + 1,
            lastMessageAt: result.message.createdAt,
          };
          if (result.meta?.lastClientMessageAt) {
            next.lastClientMessageAt = result.meta.lastClientMessageAt;
          }
          if (result.meta?.sessionDeadline) {
            next.sessionDeadline = result.meta.sessionDeadline;
          }
          return next;
        });

        if (result.case) {
          setCaseSummary((prev) => (prev ? { ...prev, ...result.case } : prev));
        }

        return result.message;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Erro ao enviar mensagem");
        throw error;
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [caseRowId, updateMeta],
  );

  const setPausedState = useCallback((paused: boolean) => {
    setCaseSummary((prev) => (prev ? { ...prev, paused } : prev));
  }, []);

  return {
    messages,
    caseSummary,
    meta,
    isLoading,
    isRefreshing,
    isSending,
    error,
    refresh: () => fetchMessages({ silent: true }),
    sendMessage,
    setPausedState,
  };
};

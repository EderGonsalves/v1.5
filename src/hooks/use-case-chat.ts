"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Número WABA associado a esta conversa (determinado das mensagens) */
  wabaPhoneNumber?: string | null;
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

// ---------------------------------------------------------------------------
// Adaptive polling intervals (ms)
// ---------------------------------------------------------------------------
const POLL_ACTIVE = 2_000;   // Conversa ativa (interação recente)
const POLL_BURST  = 1_000;   // Burst após enviar mensagem (captar resposta rápido)
const POLL_IDLE   = 15_000;  // Sem interação há 30 s
const POLL_BG     = 60_000;  // Aba em background
const IDLE_THRESHOLD_MS = 30_000; // Tempo sem interação para considerar idle
const BURST_DURATION_MS = 15_000; // Duração do burst polling após envio

// Cache de mensagens por caseId
type CachedChat = {
  messages: CaseMessage[];
  caseSummary: CaseSummary;
  meta: ChatMeta;
  timestamp: number;
};

const CHAT_CACHE_KEY_PREFIX = "onboarding_chat_cache_";
const CHAT_CACHE_TTL_MS = 60 * 1000; // 1 minuto

const getChatCache = (caseRowId: number): CachedChat | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CHAT_CACHE_KEY_PREFIX}${caseRowId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedChat;
    if (Date.now() - cached.timestamp > CHAT_CACHE_TTL_MS) {
      sessionStorage.removeItem(`${CHAT_CACHE_KEY_PREFIX}${caseRowId}`);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
};

const setChatCache = (caseRowId: number, data: Omit<CachedChat, "timestamp">): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedChat = {
      ...data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(`${CHAT_CACHE_KEY_PREFIX}${caseRowId}`, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
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
  const isSendingRef = useRef(false);

  // Adaptive polling state
  const etagRef = useRef<string | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const burstUntilRef = useRef(0); // Timestamp até quando manter burst polling

  // Mensagens otimistas pendentes (ainda não confirmadas pelo Baserow)
  const pendingOptimisticRef = useRef<CaseMessage[]>([]);

  /** Marca interação do usuário — mantém polling em ritmo rápido */
  const markActive = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

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
        const headers: HeadersInit = {};
        // Enviar ETag para conditional request (304 Not Modified)
        if (options?.silent && etagRef.current) {
          headers["If-None-Match"] = etagRef.current;
        }

        const response = await fetch(`/api/cases/${caseRowId}/messages`, {
          cache: "no-store",
          headers,
        });

        // 304 — nada mudou, skip
        if (response.status === 304) {
          return;
        }

        if (!response.ok) {
          let errorMessage = `Erro ${response.status} ao carregar mensagens`;
          try {
            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
              const errorBody = await response.json();
              errorMessage = errorBody?.error ?? errorBody?.message ?? errorMessage;
            }
          } catch {
            // Ignora erros ao parsear — usa mensagem padrão
          }
          throw new Error(errorMessage);
        }

        // Guardar ETag da resposta
        const serverETag = response.headers.get("etag");
        if (serverETag) {
          etagRef.current = serverETag;
        }

        const data = (await response.json()) as ChatFetchResponse;

        // Merge: manter mensagens otimistas que ainda não apareceram no Baserow
        const serverMessages = data.messages;
        const serverIds = new Set(serverMessages.map((m) => m.id));
        const serverContents = new Set(
          serverMessages.map((m) => `${m.content}|${m.direction}`),
        );

        // Remover otimistas já confirmadas (mesmo id OU mesmo content+direction)
        // Também limpar otimistas com mais de 60s (fallback caso N8N falhe)
        const now = Date.now();
        const OPTIMISTIC_TTL_MS = 60_000;
        pendingOptimisticRef.current = pendingOptimisticRef.current.filter(
          (opt) => {
            // Expirada — remover silenciosamente
            if (now - opt.id > OPTIMISTIC_TTL_MS) return false;
            // Confirmada pelo servidor — remover
            if (serverIds.has(opt.id)) return false;
            if (serverContents.has(`${opt.content}|${opt.direction}`)) return false;
            return true;
          },
        );

        // Combinar: msgs do servidor + otimistas ainda pendentes
        const merged =
          pendingOptimisticRef.current.length > 0
            ? [...serverMessages, ...pendingOptimisticRef.current]
            : serverMessages;

        setMessages(merged);
        setCaseSummary(data.case);
        setMeta(data.meta);

        // Salvar no cache (só as do servidor, otimistas são voláteis)
        setChatCache(caseRowId, {
          messages: serverMessages,
          caseSummary: data.case,
          meta: data.meta,
        });
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
    // Reset ETag, interação e otimistas ao trocar de caso
    etagRef.current = null;
    lastInteractionRef.current = Date.now();
    burstUntilRef.current = 0;
    pendingOptimisticRef.current = [];

    // Verificar cache primeiro
    const cached = getChatCache(caseRowId);
    if (cached) {
      setMessages(cached.messages);
      setCaseSummary(cached.caseSummary);
      setMeta(cached.meta);
      setIsLoading(false);
      // Atualizar em background
      fetchMessages({ silent: true });
    } else {
      fetchMessages();
    }
  }, [caseRowId, fetchMessages]);

  // ---------------------------------------------------------------------------
  // Adaptive polling: 3s ativo, 15s idle, 60s background
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    let unmounted = false;

    const getInterval = (): number => {
      if (typeof document !== "undefined" && document.hidden) return POLL_BG;
      if (Date.now() < burstUntilRef.current) return POLL_BURST;
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) return POLL_IDLE;
      return POLL_ACTIVE;
    };

    const tick = () => {
      if (unmounted) return;
      fetchMessages({ silent: true }).catch(() => null);
      timerId = setTimeout(tick, getInterval());
    };

    // Iniciar primeiro tick
    timerId = setTimeout(tick, getInterval());

    // Reagendar imediatamente quando a aba volta ao foco
    const onVisibility = () => {
      if (!document.hidden) {
        clearTimeout(timerId);
        // Fetch imediato ao retornar para o foco
        fetchMessages({ silent: true }).catch(() => null);
        timerId = setTimeout(tick, getInterval());
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchMessages]);

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
      markActive();

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
        if (payload.type) {
          formData.append("type", payload.type);
        }
        if (payload.wabaPhoneNumber) {
          formData.append("wabaPhoneNumber", payload.wabaPhoneNumber);
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

        // Registrar como otimista — será mantida até Baserow confirmar
        pendingOptimisticRef.current = [
          ...pendingOptimisticRef.current,
          result.message,
        ];

        // Ativar burst polling para captar resposta mais rápido
        burstUntilRef.current = Date.now() + BURST_DURATION_MS;

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
    [caseRowId, updateMeta, markActive],
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
    /** Chamar em eventos de interação (scroll, digitação) para manter polling rápido */
    markActive,
  };
};

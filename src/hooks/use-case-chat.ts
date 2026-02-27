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
  const maxKnownIdRef = useRef(0); // Highest message ID seen (for incremental polling)
  const initialLoadDoneRef = useRef(false); // Whether full load has completed

  // Mensagens otimistas pendentes (ainda não confirmadas pelo Baserow)
  const pendingOptimisticRef = useRef<CaseMessage[]>([]);

  // Refs compartilhadas para permitir reset do backoff de erro de fora do useEffect
  const consecutiveErrorsRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickFnRef = useRef<(() => void) | null>(null);
  const emptyPollsRef = useRef(0); // Contagem de polls incrementais vazios consecutivos
  const FORCE_FULL_RELOAD_AFTER = 10; // Após N polls vazios, forçar full reload

  /** Marca interação do usuário — mantém polling em ritmo rápido.
   *  Se estava em backoff de erro, reseta e força poll imediato. */
  const markActive = useCallback(() => {
    lastInteractionRef.current = Date.now();
    // Se estava em backoff de erro, resetar e forçar poll imediato
    if (consecutiveErrorsRef.current > 0) {
      consecutiveErrorsRef.current = 0;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      tickFnRef.current?.();
    }
  }, []);

  const updateMeta = useCallback((updater: (prev: ChatMeta) => ChatMeta) => {
    setMeta((prev) => updater(prev ?? DEFAULT_META));
  }, []);

  /** Update maxKnownIdRef from a list of messages */
  const trackMaxId = useCallback((msgs: CaseMessage[]) => {
    for (const m of msgs) {
      if (m.id > maxKnownIdRef.current) {
        maxKnownIdRef.current = m.id;
      }
    }
  }, []);

  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // ── Incremental polling: use since_id after initial load ────────
      // Após muitos polls vazios consecutivos, forçar full reload para detectar mensagens que
      // o incremental pode ter perdido (ex: CaseId diferente, cache server-side travado)
      const forceFullReload = emptyPollsRef.current >= FORCE_FULL_RELOAD_AFTER;
      if (forceFullReload) {
        emptyPollsRef.current = 0;
        etagRef.current = null; // Limpar ETag para evitar 304
      }
      const useIncremental = !forceFullReload && options?.silent && initialLoadDoneRef.current && maxKnownIdRef.current > 0;

      try {
        const url = useIncremental
          ? `/api/cases/${caseRowId}/messages?since_id=${maxKnownIdRef.current}`
          : `/api/cases/${caseRowId}/messages`;

        const headers: HeadersInit = {};
        // ETag only for full loads (incremental always returns new data or empty)
        if (options?.silent && !useIncremental && etagRef.current) {
          headers["If-None-Match"] = etagRef.current;
        }

        const response = await fetch(url, { cache: "no-store", headers });

        // 304 — nada mudou, skip (only for full load path)
        if (response.status === 304) {
          return true;
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

        const data = await response.json();

        if (useIncremental) {
          // ── Incremental: append new messages to existing ────────────
          const newMessages = (data.messages ?? []) as CaseMessage[];
          if (newMessages.length > 0) {
            emptyPollsRef.current = 0; // Reset: encontrou mensagens novas
            trackMaxId(newMessages);

            // Remove optimistic messages confirmed by server
            const newIds = new Set(newMessages.map((m: CaseMessage) => m.id));
            const newContents = new Set(
              newMessages.map((m: CaseMessage) => `${m.content}|${m.direction}`),
            );
            pendingOptimisticRef.current = pendingOptimisticRef.current.filter(
              (opt) => !newIds.has(opt.id) && !newContents.has(`${opt.content}|${opt.direction}`),
            );

            setMessages((prev) => {
              // Deduplicate: skip any new IDs already in prev
              const existingIds = new Set(prev.map((m) => m.id));
              const truly_new = newMessages.filter((m: CaseMessage) => !existingIds.has(m.id));
              if (!truly_new.length) return prev;

              const merged = [...prev.filter((m) => m.id > 0), ...truly_new]; // exclude negative-id legacy
              // Re-add optimistics
              if (pendingOptimisticRef.current.length > 0) {
                merged.push(...pendingOptimisticRef.current);
              }
              return merged;
            });

            // Update meta
            setMeta((prev) => prev ? {
              ...prev,
              total: prev.total + newMessages.length,
              lastMessageAt: newMessages[newMessages.length - 1].createdAt,
            } : prev);
          } else {
            emptyPollsRef.current++; // Incrementar contador de polls vazios
          }
          return true;
        }

        // ── Full load ────────────────────────────────────────────────
        const fullData = data as ChatFetchResponse;

        // Guardar ETag da resposta
        const serverETag = response.headers.get("etag");
        if (serverETag) {
          etagRef.current = serverETag;
        }

        const serverMessages = fullData.messages;
        trackMaxId(serverMessages);
        initialLoadDoneRef.current = true;

        // Merge: manter mensagens otimistas que ainda não apareceram no Baserow
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
            if (now - opt.id > OPTIMISTIC_TTL_MS) return false;
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
        setCaseSummary(fullData.case);
        setMeta(fullData.meta);

        // Salvar no cache (só as do servidor, otimistas são voláteis)
        setChatCache(caseRowId, {
          messages: serverMessages,
          caseSummary: fullData.case,
          meta: fullData.meta,
        });
        return true; // success
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Erro desconhecido ao carregar o chat",
        );
        return false; // failure
      } finally {
        if (options?.silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [caseRowId, trackMaxId],
  );

  useEffect(() => {
    // Reset state ao trocar de caso
    etagRef.current = null;
    lastInteractionRef.current = Date.now();
    burstUntilRef.current = 0;
    maxKnownIdRef.current = 0;
    initialLoadDoneRef.current = false;
    pendingOptimisticRef.current = [];
    consecutiveErrorsRef.current = 0;
    emptyPollsRef.current = 0;

    // Verificar cache primeiro
    const cached = getChatCache(caseRowId);
    if (cached) {
      setMessages(cached.messages);
      setCaseSummary(cached.caseSummary);
      setMeta(cached.meta);
      setIsLoading(false);
      // Restaurar maxKnownId do cache → background refresh será incremental
      for (const m of cached.messages) {
        if (m.id > maxKnownIdRef.current) maxKnownIdRef.current = m.id;
      }
      initialLoadDoneRef.current = true;
      // Atualizar em background (incremental — só busca msgs novas)
      fetchMessages({ silent: true });
    } else {
      fetchMessages();
    }
  }, [caseRowId, fetchMessages]);

  // ---------------------------------------------------------------------------
  // Adaptive polling: 2s ativo, 15s idle, 60s background + error backoff
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let unmounted = false;
    let tickInFlight = false; // prevent overlapping fetches

    const ERROR_BACKOFF_BASE = 4_000;  // 4s on first error
    const ERROR_BACKOFF_MAX  = 15_000; // cap at 15s (was 60s — too slow to recover)

    const getInterval = (): number => {
      const errors = consecutiveErrorsRef.current;
      // Error backoff: exponential 4s → 8s → 15s (cap)
      if (errors > 0) {
        return Math.min(
          ERROR_BACKOFF_BASE * Math.pow(2, errors - 1),
          ERROR_BACKOFF_MAX,
        );
      }
      if (typeof document !== "undefined" && document.hidden) return POLL_BG;
      if (Date.now() < burstUntilRef.current) return POLL_BURST;
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) return POLL_IDLE;
      return POLL_ACTIVE;
    };

    const scheduleTick = (delay: number) => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (unmounted || tickInFlight) return;
      tickInFlight = true;
      try {
        const ok = await fetchMessages({ silent: true });
        if (ok) {
          consecutiveErrorsRef.current = 0;
        } else {
          consecutiveErrorsRef.current++;
        }
      } catch {
        consecutiveErrorsRef.current++;
      } finally {
        tickInFlight = false;
      }
      if (!unmounted) {
        scheduleTick(getInterval());
      }
    };

    // Expor tick para que markActive/refresh possam forçar poll imediato
    tickFnRef.current = () => {
      if (!unmounted && !tickInFlight) tick();
    };

    // Iniciar primeiro tick
    scheduleTick(getInterval());

    // Reagendar imediatamente quando a aba volta ao foco
    const onVisibility = () => {
      if (!document.hidden && !tickInFlight) {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        consecutiveErrorsRef.current = 0; // reset on user return
        tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      tickFnRef.current = null;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
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
        // Forçar poll imediato (cancela timer atual de possível backoff longo)
        consecutiveErrorsRef.current = 0;
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        tickFnRef.current?.();

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
    refresh: () => {
      // Resetar backoff de erro e forçar poll imediato
      consecutiveErrorsRef.current = 0;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return fetchMessages({ silent: true }).then((ok) => {
        // Re-agendar polling normal após o refresh manual
        tickFnRef.current?.();
        return ok;
      });
    },
    sendMessage,
    setPausedState,
    /** Chamar em eventos de interação (scroll, digitação) para manter polling rápido */
    markActive,
  };
};

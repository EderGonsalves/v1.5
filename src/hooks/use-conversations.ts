"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Conversation = {
  id: number;
  caseId: number | string;
  customerName: string;
  customerPhone: string;
  lastMessage?: string;
  lastMessageAt?: Date | null;
  paused: boolean;
  bjCaseId?: string | number | null;
  etapa?: string;
  /** Número WABA associado ao caso */
  wabaPhoneNumber?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  assigned_to_user_id?: number | null;
  responsavel?: string | null;
};

type CachedConversations = {
  conversations: Conversation[];
  timestamp: number;
  institutionId: number;
};

const CACHE_KEY = "onboarding_conversations_cache";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Adaptive polling para lista de conversas (mais lento que chat)
const CONV_POLL_ACTIVE = 30_000;  // 30 s quando aba ativa
const CONV_POLL_BG     = 120_000; // 2 min quando aba background

// Cache em memória (persiste entre navegações SPA — module-level)
type ConversationsMemoryCache = {
  institutionId: number;
  conversations: Conversation[];
  timestamp: number;
};

let conversationsMemoryCache: ConversationsMemoryCache | null = null;

const getSessionCache = (institutionId: number): CachedConversations | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedConversations;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setSessionCache = (institutionId: number, conversations: Conversation[]): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedConversations = {
      conversations,
      timestamp: Date.now(),
      institutionId,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

/** Normalize a server ConversationItem into the client Conversation type */
type ServerConversationItem = {
  id: number;
  caseId: number | string;
  customerName: string;
  customerPhone: string;
  lastMessage?: string;
  lastMessageAt: string | null;
  paused: boolean;
  bjCaseId?: string | number | null;
  etapa?: string;
  wabaPhoneNumber: string | null;
  department_id?: number | null;
  department_name?: string | null;
  assigned_to_user_id?: number | null;
  responsavel?: string | null;
};

const normalizeServerItem = (item: ServerConversationItem): Conversation => {
  let lastMessageAt: Date | null = null;
  if (item.lastMessageAt) {
    const parsed = new Date(item.lastMessageAt);
    if (!Number.isNaN(parsed.getTime())) {
      lastMessageAt = parsed;
    }
  }
  return {
    id: item.id,
    caseId: item.caseId,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    lastMessage: item.lastMessage,
    lastMessageAt,
    paused: item.paused,
    bjCaseId: item.bjCaseId ?? null,
    etapa: item.etapa,
    wabaPhoneNumber: item.wabaPhoneNumber,
    department_id: item.department_id ?? null,
    department_name: item.department_name ?? null,
    assigned_to_user_id: item.assigned_to_user_id ?? null,
    responsavel: item.responsavel ?? null,
  };
};

export const useConversations = (institutionId: number | undefined) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchConversations = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!institutionId) {
        return false;
      }

      if (isFetchingRef.current) {
        return false;
      }

      isFetchingRef.current = true;
      const { silent } = options;

      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const url = `/api/conversations?institutionId=${institutionId}${silent ? "" : "&refresh=true"}`;
        const resp = await fetch(url);

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        // 304 Not Modified — nothing changed
        if (resp.status === 304) {
          return true;
        }

        const data = await resp.json();
        const items: ServerConversationItem[] = data.conversations ?? [];
        const normalized = items.map(normalizeServerItem);
        setConversations(normalized);
        setSessionCache(institutionId, normalized);

        // Auto-assign unassigned cases (fire-and-forget)
        if (!silent) {
          fetch("/api/v1/cases/auto-assign", { method: "POST" }).catch(() => {});
          fetch("/api/v1/cases/auto-merge", { method: "POST" }).catch(() => {});
        }
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar conversas",
        );
        return false;
      } finally {
        isFetchingRef.current = false;
        if (silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [institutionId],
  );

  useEffect(() => {
    if (!institutionId) {
      setIsLoading(false);
      return;
    }

    // 1. Cache em memória (navegação SPA — restauração instantânea)
    if (
      conversationsMemoryCache &&
      conversationsMemoryCache.institutionId === institutionId &&
      Date.now() - conversationsMemoryCache.timestamp < MEMORY_CACHE_TTL_MS
    ) {
      setConversations(conversationsMemoryCache.conversations);
      setIsLoading(false);
      return;
    }

    // 2. Cache em sessionStorage (reload completo)
    const cached = getSessionCache(institutionId);
    if (cached) {
      setConversations(cached.conversations);
      setIsLoading(false);
      fetchConversations({ silent: true });
    } else {
      fetchConversations();
    }
  }, [institutionId, fetchConversations]);

  // Sincronizar estado → cache em memória
  useEffect(() => {
    if (institutionId && conversations.length > 0) {
      conversationsMemoryCache = {
        institutionId,
        conversations,
        timestamp: Date.now(),
      };
    }
  }, [conversations, institutionId]);

  // ---------------------------------------------------------------------------
  // Adaptive polling: 30s aba ativa, 120s background + error backoff
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!institutionId) return undefined;
    let timerId: ReturnType<typeof setTimeout>;
    let unmounted = false;
    let consecutiveErrors = 0;
    let tickInFlight = false;

    const ERROR_BACKOFF_BASE = 30_000;
    const ERROR_BACKOFF_MAX  = 120_000;

    const getInterval = (): number => {
      if (consecutiveErrors > 0) {
        return Math.min(
          ERROR_BACKOFF_BASE * Math.pow(2, consecutiveErrors - 1),
          ERROR_BACKOFF_MAX,
        );
      }
      return typeof document !== "undefined" && document.hidden
        ? CONV_POLL_BG
        : CONV_POLL_ACTIVE;
    };

    const tick = async () => {
      if (unmounted || tickInFlight) return;
      tickInFlight = true;
      try {
        const ok = await fetchConversations({ silent: true });
        if (ok) {
          consecutiveErrors = 0;
        } else {
          consecutiveErrors++;
        }
      } catch {
        consecutiveErrors++;
      } finally {
        tickInFlight = false;
      }
      if (!unmounted) {
        timerId = setTimeout(tick, getInterval());
      }
    };

    timerId = setTimeout(tick, getInterval());

    const onVisibility = () => {
      if (!document.hidden && !unmounted && !tickInFlight) {
        clearTimeout(timerId);
        consecutiveErrors = 0;
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [institutionId, fetchConversations]);

  const refresh = useCallback(() => {
    if (institutionId) {
      conversationsMemoryCache = null;
    }
    return fetchConversations({ silent: true });
  }, [fetchConversations, institutionId]);

  return {
    conversations,
    isLoading,
    isRefreshing,
    isLoadingMore: false,
    hasMoreFromServer: false,
    loadMore: async () => {},
    error,
    refresh,
  };
};

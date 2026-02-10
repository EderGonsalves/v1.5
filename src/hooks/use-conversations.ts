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
};

type CachedConversations = {
  conversations: Conversation[];
  timestamp: number;
  institutionId: number;
};

type ApiConversation = Omit<Conversation, "lastMessageAt"> & {
  lastMessageAt: string | null;
};

const CACHE_KEY = "onboarding_conversations_cache";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

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

const parseApiConversation = (item: ApiConversation): Conversation => {
  let lastMessageAt: Date | null = null;
  if (item.lastMessageAt) {
    const parsed = new Date(item.lastMessageAt);
    if (!Number.isNaN(parsed.getTime())) {
      lastMessageAt = parsed;
    }
  }
  return { ...item, lastMessageAt };
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
        return;
      }

      if (isFetchingRef.current) {
        return;
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
        const url = silent
          ? `/api/conversations?institutionId=${institutionId}`
          : `/api/conversations?institutionId=${institutionId}&refresh=true`;

        const response = await fetch(url);
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            (body?.error as string) || `Erro ${response.status}`,
          );
        }

        const data = await response.json();
        const items: ApiConversation[] = data.conversations ?? [];
        const normalized = items.map(parseApiConversation);
        setConversations(normalized);
        setSessionCache(institutionId, normalized);

        // Auto-assign unassigned cases (fire-and-forget)
        if (!silent) {
          fetch("/api/v1/cases/auto-assign", { method: "POST" }).catch(() => {});
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar conversas",
        );
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

    const cached = getSessionCache(institutionId);
    if (cached) {
      setConversations(cached.conversations);
      setIsLoading(false);
      fetchConversations({ silent: true });
    } else {
      fetchConversations();
    }
  }, [institutionId, fetchConversations]);

  const refresh = useCallback(() => {
    return fetchConversations({ silent: true });
  }, [fetchConversations]);

  return {
    conversations,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
};

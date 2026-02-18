"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBaserowCases, type BaserowCaseRow } from "@/services/api";

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
const PAGE_SIZE = 200;
const INITIAL_MAX_PAGES = 3;

// Cache em memória (persiste entre navegações SPA — module-level)
type ConversationsMemoryCache = {
  institutionId: number;
  conversations: Conversation[];
  nextPage: number | null;
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

const normalizeRow = (row: BaserowCaseRow): Conversation => {
  const rawDate = row.Data ?? row.data ?? null;
  let lastMessageAt: Date | null = null;
  if (rawDate) {
    const parsed = new Date(String(rawDate));
    if (!Number.isNaN(parsed.getTime())) {
      lastMessageAt = parsed;
    }
  }

  const rawWabaPhone = row.display_phone_number;
  const wabaPhoneNumber = rawWabaPhone
    ? String(rawWabaPhone).replace(/\D/g, "").trim() || null
    : null;

  return {
    id: row.id,
    caseId: row.CaseId ?? row.id,
    customerName: row.CustumerName ?? "Cliente",
    customerPhone: row.CustumerPhone ?? "",
    lastMessage: row.Resumo ?? row.DepoimentoInicial ?? undefined,
    lastMessageAt,
    paused: row.IApause === "SIM",
    bjCaseId: row.BJCaseId ?? null,
    etapa: row.EtapaPerguntas ?? row.EtapaFinal ?? undefined,
    wabaPhoneNumber,
    department_id: Number(row.department_id) || null,
    department_name: row.department_name ? String(row.department_name) : null,
    assigned_to_user_id: Number(row.assigned_to_user_id) || null,
    responsavel: (row.responsavel as string) ?? null,
  };
};

const dedup = (arr: Conversation[]): Conversation[] => {
  const seen = new Set<number>();
  return arr.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
};

const sortDesc = (arr: Conversation[]) =>
  dedup([...arr]).sort((a, b) => (b.id || 0) - (a.id || 0));

export const useConversations = (institutionId: number | undefined) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const nextPageRef = useRef<number | null>(null);

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
        nextPageRef.current = null;
      }
      setError(null);

      try {
        const response = await getBaserowCases({
          institutionId,
          pageSize: PAGE_SIZE,
          fetchAll: true,
          newestFirst: true,
          maxPages: INITIAL_MAX_PAGES,
          onPageLoaded: (partial) => {
            const normalized = sortDesc(partial.map(normalizeRow));
            setConversations(normalized);
            if (!silent) setIsLoading(false);
          },
        });

        const normalized = sortDesc(response.results.map(normalizeRow));
        setConversations(normalized);

        // Calcular próxima página a buscar
        if (response.hasNextPage) {
          const totalPages = Math.ceil(response.totalCount / PAGE_SIZE);
          const pageBudget = INITIAL_MAX_PAGES - 1;
          nextPageRef.current = totalPages - pageBudget;
        } else {
          nextPageRef.current = null;
          setSessionCache(institutionId, normalized);
        }

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

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !institutionId || nextPageRef.current === null || nextPageRef.current < 1) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const startPage = nextPageRef.current;
      const endPage = Math.max(1, startPage - 2); // até 3 páginas por vez
      const pagesToFetch: number[] = [];
      for (let p = startPage; p >= endPage; p--) {
        pagesToFetch.push(p);
      }

      const results = await Promise.all(
        pagesToFetch.map((p) =>
          getBaserowCases({ institutionId, page: p, pageSize: PAGE_SIZE }),
        ),
      );

      const newConversations = results.flatMap((r) => r.results.map(normalizeRow));
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const unique = newConversations.filter((c) => !existingIds.has(c.id));
        return [...prev, ...unique].sort((a, b) => (b.id || 0) - (a.id || 0));
      });

      nextPageRef.current = endPage > 1 ? endPage - 1 : null;

      // Se carregou tudo, salvar no cache
      if (nextPageRef.current === null) {
        setConversations((prev) => {
          setSessionCache(institutionId, prev);
          return prev;
        });
      }
    } catch (err) {
      console.error("Erro ao carregar mais conversas:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, institutionId]);

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
      nextPageRef.current = conversationsMemoryCache.nextPage;
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
        nextPage: nextPageRef.current,
        timestamp: Date.now(),
      };
    }
  }, [conversations, institutionId]);

  const refresh = useCallback(() => {
    // Refresh manual limpa cache de memória para forçar reload
    if (institutionId) {
      conversationsMemoryCache = null;
    }
    return fetchConversations({ silent: true });
  }, [fetchConversations, institutionId]);

  const hasMoreFromServer = nextPageRef.current !== null;

  return {
    conversations,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMoreFromServer,
    loadMore,
    error,
    refresh,
  };
};

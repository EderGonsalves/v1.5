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
};

type CachedConversations = {
  conversations: Conversation[];
  timestamp: number;
  institutionId: number;
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

const normalizeCase = (row: BaserowCaseRow): Conversation => {
  const rawDate = row.Data ?? row.data ?? null;
  let lastMessageAt: Date | null = null;
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      lastMessageAt = parsed;
    }
  }

  // Tenta usar display_phone_number se existir
  const rawWabaPhone = row.display_phone_number;
  const wabaPhoneNumber = rawWabaPhone
    ? String(rawWabaPhone).replace(/\D/g, "").trim()
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
    wabaPhoneNumber: wabaPhoneNumber || null,
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
        const response = await getBaserowCases({
          institutionId,
          fetchAll: true,
        });

        // Ordenar por ID decrescente (mais recentes primeiro)
        const sorted = [...response.results].sort((a, b) => {
          const idA = a.id ?? 0;
          const idB = b.id ?? 0;
          return idB - idA;
        });

        const normalized = sorted.map(normalizeCase);
        setConversations(normalized);
        setSessionCache(institutionId, normalized);
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

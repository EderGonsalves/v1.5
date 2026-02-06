"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CaseStatistics } from "@/lib/case-stats";
import { getEmptyCaseStatistics } from "@/lib/case-stats";

export type StatisticsResponse = CaseStatistics & {
  cached: boolean;
  cachedAt: string | null;
};

type FetchOptions = {
  silent?: boolean;
  forceRefresh?: boolean;
};

type CachedStats = {
  stats: CaseStatistics;
  timestamp: number;
  institutionId: number;
};

const CACHE_KEY = "onboarding_stats_cache";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getSessionCache = (institutionId: number): CachedStats | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedStats;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setSessionCache = (institutionId: number, stats: CaseStatistics): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedStats = {
      stats,
      timestamp: Date.now(),
      institutionId,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

export const useStatistics = (institutionId: number | undefined) => {
  const [stats, setStats] = useState<CaseStatistics>(getEmptyCaseStatistics());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchStats = useCallback(
    async (options: FetchOptions = {}) => {
      if (!institutionId) {
        return;
      }

      // Prevenir múltiplas chamadas simultâneas
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      const { silent, forceRefresh } = options;

      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          institutionId: String(institutionId),
        });
        if (forceRefresh) {
          params.set("refresh", "true");
        }

        const response = await fetch(`/api/cases/stats?${params.toString()}`, {
          cache: "no-store",
          credentials: "include", // Enviar cookies de autenticação
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage =
            errorData?.error ||
            errorData?.message ||
            "Erro ao carregar estatísticas";
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as StatisticsResponse;

        const newStats: CaseStatistics = {
          totalCases: data.totalCases,
          pausedCases: data.pausedCases,
          stageCounts: data.stageCounts,
          stagePercentages: data.stagePercentages,
          pausedPercentage: data.pausedPercentage,
        };

        setStats(newStats);
        setIsCached(data.cached);
        const updatedAt = data.cachedAt ? new Date(data.cachedAt) : new Date();
        setLastUpdated(updatedAt);

        // Salvar no sessionStorage
        setSessionCache(institutionId, newStats);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro desconhecido ao carregar estatísticas",
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

  // Efeito único para carregar dados
  useEffect(() => {
    if (!institutionId) {
      setIsLoading(false);
      return;
    }

    // Verificar cache primeiro
    const cached = getSessionCache(institutionId);
    if (cached) {
      // Carregar do cache imediatamente
      setStats(cached.stats);
      setLastUpdated(new Date(cached.timestamp));
      setIsCached(true);
      setIsLoading(false);
      // Atualizar em background
      fetchStats({ silent: true });
    } else {
      // Sem cache, carregar normalmente
      fetchStats();
    }
  }, [institutionId, fetchStats]);

  // Função de refresh que força atualização
  const refresh = useCallback(() => {
    return fetchStats({ silent: true, forceRefresh: true });
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    isCached,
    refresh,
  };
};

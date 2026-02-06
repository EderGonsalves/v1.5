"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CaseWabaMap = Record<string, string>;

type CachedCaseWabaMap = {
  data: CaseWabaMap;
  timestamp: number;
  institutionId: number;
};

const CACHE_KEY = "onboarding_case_waba_map_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const getSessionCache = (institutionId: number): CachedCaseWabaMap | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCaseWabaMap;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setSessionCache = (institutionId: number, data: CaseWabaMap): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCaseWabaMap = {
      data,
      timestamp: Date.now(),
      institutionId,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

/**
 * Hook que busca o mapa de CaseId -> wabaPhoneNumber para enriquecer conversas.
 */
export const useCaseWabaMap = (institutionId: number | undefined) => {
  const [caseWabaMap, setCaseWabaMap] = useState<CaseWabaMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const fetchMap = useCallback(
    async (forceRefresh = false) => {
      if (!institutionId) {
        setIsLoading(false);
        return;
      }

      if (isFetchingRef.current) {
        return;
      }

      if (!forceRefresh) {
        const cached = getSessionCache(institutionId);
        if (cached) {
          setCaseWabaMap(cached.data);
          setIsLoading(false);
          return;
        }
      }

      isFetchingRef.current = true;

      try {
        const response = await fetch("/api/waba/case-numbers");

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          console.error("[useCaseWabaMap] API error:", response.status, errorBody);
          setCaseWabaMap({});
          return;
        }

        const data = await response.json();
        const map = (data.caseNumbers || {}) as CaseWabaMap;
        setCaseWabaMap(map);
        setSessionCache(institutionId, map);
      } catch (error) {
        console.error("[useCaseWabaMap] Erro:", error);
        setCaseWabaMap({});
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [institutionId],
  );

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  const getWabaForCase = useCallback(
    (caseId?: number | string | null, rowId?: number | string | null): string | null => {
      if (caseId !== null && caseId !== undefined) {
        const key = String(caseId);
        if (caseWabaMap[key]) {
          return caseWabaMap[key];
        }
      }

      if (rowId !== null && rowId !== undefined) {
        const key = String(rowId);
        if (caseWabaMap[key]) {
          return caseWabaMap[key];
        }
      }

      return null;
    },
    [caseWabaMap],
  );

  return {
    caseWabaMap,
    isLoading,
    getWabaForCase,
    refresh: () => fetchMap(true),
  };
};

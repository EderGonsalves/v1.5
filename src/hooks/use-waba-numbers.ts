"use client";

import { useCallback, useEffect, useState } from "react";

export type WabaNumber = {
  phoneNumber: string;
  configId: number;
  label?: string;
  departmentId?: number | null;
  departmentName?: string | null;
};

type WabaNumbersResponse = {
  numbers: WabaNumber[];
  hasMultiple: boolean;
};

type CachedWabaNumbers = {
  data: WabaNumbersResponse;
  timestamp: number;
  institutionId: number;
};

const CACHE_KEY = "onboarding_waba_numbers_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const getSessionCache = (institutionId: number): CachedWabaNumbers | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedWabaNumbers;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setSessionCache = (institutionId: number, data: WabaNumbersResponse): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedWabaNumbers = {
      data,
      timestamp: Date.now(),
      institutionId,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

const formatPhoneForDisplay = (phone: string): string => {
  // Remove caracteres não numéricos
  const digits = phone.replace(/\D/g, "");

  // Formato brasileiro: +55 (11) 99999-9999
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9);
    return `+55 (${ddd}) ${part1}-${part2}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 8);
    const part2 = digits.slice(8);
    return `+55 (${ddd}) ${part1}-${part2}`;
  }

  // Retorna como está se não reconhecer o formato
  return phone;
};

export const useWabaNumbers = (institutionId: number | undefined) => {
  const [numbers, setNumbers] = useState<WabaNumber[]>([]);
  const [hasMultiple, setHasMultiple] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNumbers = useCallback(async (forceRefresh = false) => {
    if (!institutionId) {
      setIsLoading(false);
      return;
    }

    // Verificar cache primeiro (se não forçar refresh)
    if (!forceRefresh) {
      const cached = getSessionCache(institutionId);
      if (cached) {
        console.log("[useWabaNumbers] Using cache:", cached.data);
        setNumbers(cached.data.numbers);
        setHasMultiple(cached.data.hasMultiple);
        setIsLoading(false);
        return;
      }
    }

    try {
      console.log("[useWabaNumbers] Fetching for institution:", institutionId);
      const response = await fetch(`/api/waba/numbers`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error("[useWabaNumbers] API error:", response.status, errorBody);
        // Em caso de erro, não quebra a UI - apenas loga
        setNumbers([]);
        setHasMultiple(false);
        return;
      }

      const data: WabaNumbersResponse = await response.json();
      console.log("[useWabaNumbers] Loaded:", data);
      setNumbers(data.numbers);
      setHasMultiple(data.hasMultiple);
      setSessionCache(institutionId, data);
    } catch (error) {
      console.error("[useWabaNumbers] Erro:", error);
      setNumbers([]);
      setHasMultiple(false);
    } finally {
      setIsLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchNumbers();
  }, [fetchNumbers]);

  return {
    numbers,
    hasMultiple,
    isLoading,
    formatPhoneForDisplay,
  };
};

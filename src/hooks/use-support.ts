"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportTicketRow } from "@/services/support";
import {
  fetchTicketsClient,
  createTicketClient,
  updateTicketClient,
} from "@/services/support-client";

type CachedTickets = {
  tickets: SupportTicketRow[];
  timestamp: number;
};

const CACHE_KEY = "onboarding_support_cache";
const CACHE_TTL_MS = 2 * 60 * 1000;

const getSessionCache = (): CachedTickets | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedTickets;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setSessionCache = (tickets: SupportTicketRow[]): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedTickets = { tickets, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
};

export function useSupport() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchTickets = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      const { silent } = options;

      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const data = await fetchTicketsClient();
        setTickets(data);
        setSessionCache(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar chamados",
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
    [],
  );

  useEffect(() => {
    const cached = getSessionCache();
    if (cached) {
      setTickets(cached.tickets);
      setIsLoading(false);
      fetchTickets({ silent: true });
    } else {
      fetchTickets();
    }
  }, [fetchTickets]);

  const refresh = useCallback(() => {
    return fetchTickets({ silent: true });
  }, [fetchTickets]);

  const createNewTicket = useCallback(
    async (data: { category: string; subject: string; description: string }) => {
      const ticket = await createTicketClient(data);
      setTickets((prev) => [ticket, ...prev]);
      return ticket;
    },
    [],
  );

  const updateExistingTicket = useCallback(
    async (
      ticketId: number,
      data: {
        status?: string;
        sector?: string;
        assigned_to?: string;
        department_id?: number | null;
        department_name?: string | null;
        assigned_to_user_id?: number | null;
      },
    ) => {
      const updated = await updateTicketClient(ticketId, data);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? updated : t)),
      );
      return updated;
    },
    [],
  );

  return {
    tickets,
    isLoading,
    isRefreshing,
    error,
    refresh,
    createTicket: createNewTicket,
    updateTicket: updateExistingTicket,
  };
}

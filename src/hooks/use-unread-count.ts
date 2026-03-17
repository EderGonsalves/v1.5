"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "onboarding_chat_last_seen";
const POLL_INTERVAL_MS = 60_000; // 60s

type LastSeenMap = Record<number, string>; // { [caseId]: ISO timestamp }

function getLastSeenMap(): LastSeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLastSeenMap(map: LastSeenMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

type UnreadSummaryItem = { id: number; lastMessageAt: string | null };

export function useUnreadCount(institutionId: number | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef<LastSeenMap>(getLastSeenMap());
  const summaryRef = useRef<UnreadSummaryItem[]>([]);
  const fetchingRef = useRef(false);

  const [unreadCaseIds, setUnreadCaseIds] = useState<Set<number>>(new Set());

  const recalculate = useCallback(() => {
    const lastSeen = lastSeenRef.current;
    let count = 0;
    const ids = new Set<number>();
    for (const item of summaryRef.current) {
      if (!item.lastMessageAt) continue;
      const seen = lastSeen[item.id];
      if (!seen || item.lastMessageAt > seen) {
        count++;
        ids.add(item.id);
      }
    }
    setUnreadCount(count);
    setUnreadCaseIds(ids);
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!institutionId || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const resp = await fetch("/api/v1/chat/unread-summary");
      if (resp.ok) {
        const data = await resp.json();
        summaryRef.current = data.conversations ?? [];
        recalculate();
      }
    } catch {
      // ignore
    } finally {
      fetchingRef.current = false;
    }
  }, [institutionId, recalculate]);

  const markAsSeen = useCallback((caseId: number) => {
    const map = getLastSeenMap();
    map[caseId] = new Date().toISOString();
    setLastSeenMap(map);
    lastSeenRef.current = map;
    // Recalculate immediately
    let count = 0;
    const ids = new Set<number>();
    for (const item of summaryRef.current) {
      if (!item.lastMessageAt) continue;
      const seen = map[item.id];
      if (!seen || item.lastMessageAt > seen) {
        count++;
        ids.add(item.id);
      }
    }
    setUnreadCount(count);
    setUnreadCaseIds(ids);
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    if (!institutionId) return;

    fetchSummary();

    const intervalId = setInterval(fetchSummary, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [institutionId, fetchSummary]);

  // Listen for Service Worker messages (immediate update on push)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "NEW_MESSAGE") {
        // Refresh summary immediately when push arrives
        fetchSummary();
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [fetchSummary]);

  return { unreadCount, unreadCaseIds, markAsSeen, refresh: fetchSummary };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchQueueMode, type QueueMode } from "@/services/queue-mode-client";

export const useQueueMode = () => {
  const [queueMode, setQueueMode] = useState<QueueMode>("round_robin");
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const mode = await fetchQueueMode();
      setQueueMode(mode);
    } catch {
      // Default to round_robin on error
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(), [fetchData]);

  return { queueMode, setQueueMode, isLoading, refresh };
};

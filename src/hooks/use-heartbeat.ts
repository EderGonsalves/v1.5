"use client";

import { useEffect, useRef } from "react";
import type { AuthInfo } from "@/lib/validations";

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

export function useHeartbeat(auth: AuthInfo | null) {
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    if (!auth) return;

    const ping = () => {
      if (!authRef.current) return;
      fetch("/api/v1/users/heartbeat", {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // silently ignore heartbeat errors
      });
    };

    // Ping immediately on mount
    ping();

    // Set up interval
    let intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // Pause when tab is hidden, resume when visible
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ping();
        clearInterval(intervalId);
        intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
      } else {
        clearInterval(intervalId);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [!!auth]); // re-run only when auth presence changes
}

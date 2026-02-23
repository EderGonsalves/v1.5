"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ALL_FEATURE_PATHS } from "@/lib/feature-registry";
import { fetchPermissionsStatusClient } from "@/services/permissions-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PermissionsState = {
  isSysAdmin: boolean;
  isOfficeAdmin: boolean;
  enabledPages: string[];
  enabledActions: string[];
  isLoading: boolean;
};

const INITIAL_STATE: PermissionsState = {
  isSysAdmin: false,
  isOfficeAdmin: false,
  enabledPages: [],
  enabledActions: [],
  isLoading: true,
};

// ---------------------------------------------------------------------------
// sessionStorage cache — instant restore on SPA navigation / refresh
// ---------------------------------------------------------------------------

const STORAGE_KEY = "onboarding_permissions_cache";
const STORAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type StoredPermissions = {
  authSignature: string;
  isSysAdmin: boolean;
  isOfficeAdmin: boolean;
  enabledPages: string[];
  enabledActions: string[];
  ts: number;
};

const readStoredPermissions = (
  authSignature: string,
): Omit<StoredPermissions, "authSignature" | "ts"> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: StoredPermissions = JSON.parse(raw);
    if (stored.authSignature !== authSignature) return null;
    if (Date.now() - stored.ts > STORAGE_TTL_MS) return null;
    return {
      isSysAdmin: stored.isSysAdmin,
      isOfficeAdmin: stored.isOfficeAdmin,
      enabledPages: stored.enabledPages,
      enabledActions: stored.enabledActions,
    };
  } catch {
    return null;
  }
};

const writeStoredPermissions = (
  authSignature: string,
  state: PermissionsState,
): void => {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredPermissions = {
      authSignature,
      isSysAdmin: state.isSysAdmin,
      isOfficeAdmin: state.isOfficeAdmin,
      enabledPages: state.enabledPages,
      enabledActions: state.enabledActions,
      ts: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
};

// ---------------------------------------------------------------------------
// Module-level memory cache (survives SPA navigations)
// ---------------------------------------------------------------------------

let memoryCache: { authSignature: string; state: PermissionsState; ts: number } | null = null;
const MEMORY_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const usePermissionsStatus = (authSignature?: string | null) => {
  // Compute initial state synchronously from caches (avoids flash)
  const [state, setState] = useState<PermissionsState>(() => {
    if (!authSignature) return { ...INITIAL_STATE, isLoading: false };

    // 1. Try module-level memory cache (fastest — same JS session)
    if (
      memoryCache &&
      memoryCache.authSignature === authSignature &&
      Date.now() - memoryCache.ts < MEMORY_TTL_MS
    ) {
      return { ...memoryCache.state, isLoading: false };
    }

    // 2. Try sessionStorage (survives full page reload)
    const stored = readStoredPermissions(authSignature);
    if (stored) {
      const restored: PermissionsState = {
        ...stored,
        isLoading: false,
      };
      // Seed memory cache
      memoryCache = { authSignature, state: restored, ts: Date.now() };
      return restored;
    }

    // 3. No cache — start in loading state
    return INITIAL_STATE;
  });

  const activeRef = useRef(true);
  const lastSignatureRef = useRef(authSignature);

  const applyResult = useCallback(
    (
      sig: string,
      result: {
        isSysAdmin?: boolean;
        isOfficeAdmin?: boolean;
        enabledPages?: string[];
        enabledActions?: string[];
      },
    ) => {
      const next: PermissionsState = {
        isSysAdmin: Boolean(result.isSysAdmin),
        isOfficeAdmin: Boolean(result.isOfficeAdmin),
        enabledPages: Array.isArray(result.enabledPages)
          ? result.enabledPages
          : ALL_FEATURE_PATHS,
        enabledActions: Array.isArray(result.enabledActions)
          ? result.enabledActions
          : [],
        isLoading: false,
      };

      // Update caches
      memoryCache = { authSignature: sig, state: next, ts: Date.now() };
      writeStoredPermissions(sig, next);

      // Single atomic setState — no race condition between fields
      setState(next);
    },
    [],
  );

  useEffect(() => {
    activeRef.current = true;
    lastSignatureRef.current = authSignature;

    if (!authSignature) {
      const empty: PermissionsState = { ...INITIAL_STATE, isLoading: false };
      setState(empty);
      memoryCache = null;
      return () => {
        activeRef.current = false;
      };
    }

    // If we already have cached state (set in initializer), still fetch fresh
    // data in the background — but DON'T show loading state.
    const hasCachedState =
      (memoryCache &&
        memoryCache.authSignature === authSignature &&
        Date.now() - memoryCache.ts < MEMORY_TTL_MS) ||
      readStoredPermissions(authSignature) !== null;

    if (!hasCachedState) {
      setState(INITIAL_STATE);
    }

    const load = async () => {
      try {
        const status = await fetchPermissionsStatusClient();
        if (activeRef.current && lastSignatureRef.current === authSignature) {
          applyResult(authSignature, status);
        }
      } catch (error) {
        console.warn(
          "Não foi possível verificar status de permissões",
          error,
        );
        if (activeRef.current && lastSignatureRef.current === authSignature) {
          // On error, grant ALL pages (fail-open for UX) — same as before
          applyResult(authSignature, {
            isSysAdmin: false,
            isOfficeAdmin: false,
            enabledPages: ALL_FEATURE_PATHS,
            enabledActions: [],
          });
        }
      }
    };

    void load();

    return () => {
      activeRef.current = false;
    };
  }, [authSignature, applyResult]);

  return state;
};

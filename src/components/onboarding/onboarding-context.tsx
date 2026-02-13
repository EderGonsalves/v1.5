"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

import {
  defaultOnboardingData,
  type OnboardingData,
  type AuthInfo,
} from "@/lib/validations";
import {
  ONBOARDING_AUTH_STORAGE,
} from "@/lib/auth/constants";
import { ensureLegacyUserIdentifier } from "@/lib/auth/user";
import { invalidatePermissionsStatusCache } from "@/services/permissions-client";


// Server-side cookie management via API (HttpOnly cookie)
const setSessionCookie = (auth: AuthInfo): Promise<void> => {
  return fetch("/api/v1/auth/set-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(auth),
  }).then(() => {}).catch(() => {
    // Fallback: cookie will be set on next login
  });
};

const clearSessionCookie = (): void => {
  fetch("/api/v1/auth/logout", {
    method: "POST",
  }).catch(() => {
    // Non-blocking
  });
};

type OnboardingContextValue = {
  data: OnboardingData;
  isHydrated: boolean;
  updateSection: (values: Partial<OnboardingData>) => void;
  reset: () => void;
  logout: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(
  undefined,
);

const loadAuthFromStorage = (): AuthInfo | null => {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(ONBOARDING_AUTH_STORAGE);
    if (!stored) return null;
    
    const auth = JSON.parse(stored) as AuthInfo;
    return ensureLegacyUserIdentifier(auth);
  } catch (error) {
    console.error("Erro ao carregar autenticação do localStorage:", error);
    return null;
  }
};

const saveAuthToStorage = (auth: AuthInfo | null): void => {
  if (typeof window === "undefined") return;

  try {
    if (auth) {
      const normalizedAuth = ensureLegacyUserIdentifier(auth);
      const authJson = JSON.stringify(normalizedAuth);
      localStorage.setItem(ONBOARDING_AUTH_STORAGE, authJson);
      setSessionCookie(normalizedAuth);
    } else {
      localStorage.removeItem(ONBOARDING_AUTH_STORAGE);
      clearSessionCookie();
    }
  } catch (error) {
    console.error("Erro ao salvar autenticação no localStorage:", error);
  }
};

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<OnboardingData>(defaultOnboardingData);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carregar auth do localStorage após montagem (evita hydration mismatch)
  // Aguarda o cookie HttpOnly ser setado antes de marcar isHydrated,
  // para que API calls subsequentes já tenham o cookie disponível.
  useEffect(() => {
    const hydrate = async () => {
      const savedAuth = loadAuthFromStorage();
      if (savedAuth) {
        const ensuredAuth = ensureLegacyUserIdentifier(savedAuth);
        setData((prev) => ({
          ...prev,
          auth: ensuredAuth,
        }));
        await setSessionCookie(ensuredAuth);
      }
      setIsHydrated(true);
    };
    hydrate();
  }, []);

  useEffect(() => {
    // Sincronizar auth com localStorage sempre que mudar (apenas após hydration)
    if (!isHydrated) return;
    if (data.auth) {
      saveAuthToStorage(data.auth);
    } else {
      saveAuthToStorage(null);
    }
  }, [data.auth, isHydrated]);

  const updateSection = (values: Partial<OnboardingData>) => {
    setData((prev) => {
      const updated = { ...prev, ...values };
      // Se auth foi atualizado, salvar no localStorage
      if (values.auth !== undefined) {
        saveAuthToStorage(updated.auth);
      }
      return updated;
    });
  };

  const reset = () => {
    setData((prev) => ({
      ...defaultOnboardingData,
      auth: prev.auth,
    }));
  };

  const logout = () => {
    saveAuthToStorage(null);
    setData(defaultOnboardingData);
    // Limpar caches de dados para forçar refresh no próximo login
    invalidatePermissionsStatusCache();
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("onboarding_cases_cache");
        sessionStorage.removeItem("onboarding_stats_cache");
      } catch {
        // Ignorar erros de storage
      }
    }
  };

  return (
    <OnboardingContext.Provider value={{ data, isHydrated, updateSection, reset, logout }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error("useOnboarding deve ser usado dentro do OnboardingProvider");
  }

  return context;
};

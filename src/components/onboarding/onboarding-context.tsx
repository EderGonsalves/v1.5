"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

import {
  defaultOnboardingData,
  type OnboardingData,
  type AuthInfo,
} from "@/lib/validations";

const AUTH_STORAGE_KEY = "onboarding_auth";
const AUTH_COOKIE_NAME = "onboarding_auth";

// Funções para gerenciar cookies
const setCookie = (name: string, value: string, days = 7): void => {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const deleteCookie = (name: string): void => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
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
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    
    const auth = JSON.parse(stored) as AuthInfo;
    return auth;
  } catch (error) {
    console.error("Erro ao carregar autenticação do localStorage:", error);
    return null;
  }
};

const saveAuthToStorage = (auth: AuthInfo | null): void => {
  if (typeof window === "undefined") return;

  try {
    if (auth) {
      const authJson = JSON.stringify(auth);
      localStorage.setItem(AUTH_STORAGE_KEY, authJson);
      // Também salva em cookie para que as APIs possam acessar
      setCookie(AUTH_COOKIE_NAME, authJson);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      deleteCookie(AUTH_COOKIE_NAME);
    }
  } catch (error) {
    console.error("Erro ao salvar autenticação no localStorage:", error);
  }
};

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<OnboardingData>(defaultOnboardingData);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carregar auth do localStorage após montagem (evita hydration mismatch)
  useEffect(() => {
    const savedAuth = loadAuthFromStorage();
    if (savedAuth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o auth do localStorage apenas depois do mount
      setData((prev) => ({
        ...prev,
        auth: savedAuth,
      }));
      // Garantir que o cookie também esteja configurado (caso o usuário já estava logado)
      setCookie(AUTH_COOKIE_NAME, JSON.stringify(savedAuth));
    }
    setIsHydrated(true);
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
    deleteCookie(AUTH_COOKIE_NAME);
    setData(defaultOnboardingData);
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

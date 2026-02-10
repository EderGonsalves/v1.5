"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  isDarkMode: boolean;
  toggleCollapse: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  toggleDarkMode: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

const COLLAPSED_KEY = "sidebar_collapsed";
const THEME_KEY = "theme";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    const storedCollapsed = localStorage.getItem(COLLAPSED_KEY);
    if (storedCollapsed === "true") setIsCollapsed(true);

    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === "dark") {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return (
    <SidebarContext value={{
      isCollapsed,
      isMobileOpen,
      isDarkMode,
      toggleCollapse,
      openMobile,
      closeMobile,
      toggleDarkMode,
    }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

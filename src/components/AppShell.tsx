"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ShieldX } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { cn } from "@/lib/utils";
import { ALWAYS_ALLOWED_PATHS } from "@/lib/feature-registry";
import { usePermissionsStatus } from "@/hooks/use-permissions-status";
import { PwaModals } from "@/components/pwa/PwaModals";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useOnboarding();
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  const authSignature = data.auth
    ? `${data.auth.institutionId}:${data.auth.legacyUserId ?? ""}`
    : null;
  const { isSysAdmin, enabledPages, isLoading } =
    usePermissionsStatus(authSignature);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasAuth = isMounted && data.auth;

  // Login page: no sidebar, no header, just render children full-width
  if (!hasAuth) {
    return <>{children}</>;
  }

  const isPageAllowed =
    isLoading ||
    isSysAdmin ||
    ALWAYS_ALLOWED_PATHS.some((p) => pathname === p) ||
    enabledPages.some((p) => pathname.startsWith(p));

  if (!isPageAllowed) {
    return (
      <div className="min-h-screen">
        <Sidebar />
        <div
          className={cn(
            "flex flex-col min-h-screen sidebar-transition",
            "lg:ml-[var(--sidebar-width)]",
            isCollapsed && "lg:ml-[var(--sidebar-width-collapsed)]",
          )}
        >
          <Header />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center px-4 py-16">
              <ShieldX className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h2 className="mt-4 text-sm font-semibold text-foreground">
                Acesso não disponível
              </h2>
              <p className="mt-2 text-xs text-muted-foreground max-w-sm mx-auto">
                Esta funcionalidade não está habilitada para a sua instituição.
                Entre em contato com o administrador do sistema.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div
        className={cn(
          "flex flex-col min-h-screen sidebar-transition",
          "lg:ml-[var(--sidebar-width)]",
          isCollapsed && "lg:ml-[var(--sidebar-width-collapsed)]",
        )}
      >
        <Header />
        <PwaModals />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

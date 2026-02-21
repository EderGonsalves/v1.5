"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  CalendarDays,
  Plug,
  Repeat2,
  Building2,
  Users,
  FileCode,
  Shuffle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { usePermissionsStatus } from "@/hooks/use-permissions-status";
import { useMyDepartments } from "@/hooks/use-my-departments";

type SettingsNavItem = {
  href: string;
  label: string;
  icon: typeof Settings;
  requiresSysAdmin?: boolean;
};

const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/configuracoes", label: "Geral", icon: Settings },
  { href: "/configuracoes/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/configuracoes/conexoes", label: "Conexões", icon: Plug },
  { href: "/configuracoes/follow-up", label: "Follow-up", icon: Repeat2 },
  { href: "/configuracoes/departamentos", label: "Departamentos", icon: Building2 },
  { href: "/configuracoes/usuarios", label: "Usuários", icon: Users },
  { href: "/configuracoes/templates", label: "Modelos", icon: FileCode },
  { href: "/configuracoes/distribuicao", label: "Distribuição", icon: Shuffle },
  { href: "/configuracoes/permissoes", label: "Permissões", icon: ShieldCheck, requiresSysAdmin: true },
];

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data } = useOnboarding();
  const authSignature = data.auth
    ? `${data.auth.institutionId}:${data.auth.legacyUserId ?? ""}`
    : null;
  const { isSysAdmin } = usePermissionsStatus(authSignature);

  const visibleItems = SETTINGS_NAV.filter((item) => {
    if (item.requiresSysAdmin && !isSysAdmin) return false;
    return true;
  });

  const isActive = (href: string) => {
    if (href === "/configuracoes") return pathname === "/configuracoes";
    return pathname.startsWith(href);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-4">
        {/* Header */}
        <h1 className="text-xl font-semibold text-foreground mb-4">
          Configurações
        </h1>

        {/* Mobile nav — horizontal scrollable */}
        <nav className="lg:hidden flex gap-1 overflow-x-auto scrollbar-hide border-b border-border/40 pb-2 mb-4">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs rounded-md transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop layout: sidebar + content */}
        <div className="flex gap-6">
          {/* Desktop sidebar nav */}
          <nav className="hidden lg:flex flex-col w-[200px] shrink-0">
            <div className="sticky top-20 flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-2 border-transparent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Settings,
  Plug,
  LogOut,
  FileText,
  BarChart3,
  Repeat2,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  CalendarDays,
  ShieldCheck,
  Users,
  Building2,
  CircleHelp,
} from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { cn } from "@/lib/utils";
import { usePermissionsStatus } from "@/hooks/use-permissions-status";
import { useMyDepartments } from "@/hooks/use-my-departments";

type NavItem = {
  href: string;
  label: string;
  icon: typeof FileText;
  requiresSysAdmin?: boolean;
  requiresAdmin?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/casos", label: "Casos", icon: FileText },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/estatisticas", label: "Estatísticas", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/conexoes", label: "Conexões", icon: Plug },
  { href: "/follow-up", label: "Follow-up", icon: Repeat2 },
  { href: "/usuarios", label: "Usuários", icon: Users, requiresAdmin: true },
  { href: "/departamentos", label: "Departamentos", icon: Building2, requiresAdmin: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, data } = useOnboarding();
  const { isCollapsed, isMobileOpen, toggleCollapse, closeMobile } = useSidebar();
  const authSignature = data.auth
    ? `${data.auth.institutionId}:${data.auth.legacyUserId ?? ""}`
    : null;
  const { isSysAdmin, isOfficeAdmin: isPermOfficeAdmin, enabledPages, isLoading: permLoading } = usePermissionsStatus(authSignature);
  const { isOfficeAdmin } = useMyDepartments();
  const isAdmin = isSysAdmin || isOfficeAdmin || isPermOfficeAdmin;
  // Pages always visible for any authenticated user (even during loading)
  const alwaysVisiblePaths = new Set(["/casos", "/chat", "/suporte"]);
  const baseNavItems = NAV_ITEMS.filter((item) => {
    if (item.requiresSysAdmin && !isSysAdmin) return false;
    if (item.requiresAdmin && !isAdmin) return false;
    if (isAdmin) return true;
    // During loading, only show always-visible items
    if (permLoading) return alwaysVisiblePaths.has(item.href);
    return enabledPages.includes(item.href);
  });
  const showSuport = isSysAdmin || enabledPages.includes("/suporte");
  const navItems: NavItem[] = [
    ...baseNavItems,
    ...(isSysAdmin
      ? [
          {
            href: "/configuracoes/permissoes",
            label: "Permissões",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(showSuport
      ? [{ href: "/suporte", label: "Suporte", icon: CircleHelp }]
      : []),
  ];

  const handleLogout = () => {
    logout();
    closeMobile();
    router.push("/");
  };

  const handleNavClick = () => {
    closeMobile();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (mobile: boolean) => (
    <>
      {/* Top: toggle or close */}
      <div className="flex items-center h-16 px-3 border-b border-sidebar-border shrink-0">
        {mobile ? (
          <button
            onClick={closeMobile}
            className="p-2 rounded-md hover:bg-sidebar-accent/50 text-sidebar-foreground"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-md hover:bg-sidebar-accent/50 text-sidebar-foreground"
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        )}
        {(!isCollapsed || mobile) && (
          <span className="ml-2 text-sm font-semibold text-sidebar-foreground truncate">
            Menu
          </span>
        )}
      </div>

      {/* Middle: Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              title={isCollapsed && !mobile ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                isCollapsed && !mobile && "justify-center px-0"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {(!isCollapsed || mobile) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Logout */}
      <div className="border-t border-sidebar-border p-2 shrink-0">
        <button
          onClick={handleLogout}
          title={isCollapsed && !mobile ? "Sair" : undefined}
          className={cn(
            "flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            isCollapsed && !mobile && "justify-center px-0"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(!isCollapsed || mobile) && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        data-sidebar
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col bg-sidebar text-sidebar-foreground",
          "w-[240px] lg:hidden",
          "transition-transform duration-200 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        data-sidebar
        className={cn(
          "fixed top-0 left-0 h-full z-30 flex-col bg-sidebar text-sidebar-foreground",
          "hidden lg:flex sidebar-transition",
          isCollapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
        )}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
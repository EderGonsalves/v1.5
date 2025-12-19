"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, Plug, LogOut, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-context";

export const Header = () => {
  const router = useRouter();
  const { logout, data } = useOnboarding();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const hasAuth = isMounted && data.auth;

  // Ocultar header na tela de login
  if (!hasAuth) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image
            src="https://app.riasistemas.com.br/_nuxt/img/icon.fd8c0a5.png"
            alt="Briefing Jurídico"
            width={32}
            height={32}
            className="h-8 w-8 rounded-sm"
            unoptimized
          />
          <span className="text-lg font-semibold text-foreground">
            Briefing Jurídico
          </span>
        </Link>
        {hasAuth && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="gap-2"
            >
              <Link href="/casos">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Casos</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="gap-2"
            >
              <Link href="/configuracoes">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Configurações</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="gap-2"
            >
              <Link href="/conexoes">
                <Plug className="h-4 w-4" />
                <span className="hidden sm:inline">Conexões</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};


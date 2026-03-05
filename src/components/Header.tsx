"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Menu,
  Sun,
  Moon,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useSidebar } from "@/components/sidebar/sidebar-context";

export const Header = () => {
  const { data } = useOnboarding();
  const { openMobile, isDarkMode, toggleDarkMode } = useSidebar();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasAuth = isMounted && data.auth;

  if (!hasAuth) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-[#D4E0EB] dark:bg-background/95 backdrop-blur dark:supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 lg:h-16 items-center justify-between px-3 lg:px-4">
        {/* Left: Hamburger (mobile) + Logo */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openMobile}
            className="lg:hidden p-2"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="https://app.riasistemas.com.br/_nuxt/img/icon.fd8c0a5.png"
              alt="Briefing Jurídico"
              width={32}
              height={32}
              className="h-8 w-8 rounded-sm"
              unoptimized
            />
            <span className="text-lg font-semibold text-foreground hidden sm:inline">
              Briefing Jurídico
            </span>
          </Link>
        </div>

        {/* Right: Dark mode + Minha Conta */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Dark Mode Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleDarkMode}
            className="p-2"
            aria-label={isDarkMode ? "Modo claro" : "Modo escuro"}
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* My Account */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="p-2"
            aria-label="Minha Conta"
            asChild
          >
            <Link href="/minha-conta">
              <UserCircle className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
};

"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Loader2,
  Menu,
  Sun,
  Moon,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import {
  getAgentStateRows,
  getBaserowConfigs,
  registerAgentState,
  updateIaAtivada,
  type AgentStateRow,
  type BaserowConfigRow,
} from "@/services/api";

export const Header = () => {
  const { data } = useOnboarding();
  const { openMobile, isDarkMode, toggleDarkMode } = useSidebar();
  const [isMounted, setIsMounted] = useState(false);
  const institutionId = data.auth?.institutionId ?? null;
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [isUpdatingState, setIsUpdatingState] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const isManualUpdateRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (isManualUpdateRef.current) {
      return;
    }

    if (!isMounted || !institutionId) {
      setPhoneNumber(null);
      setIsAgentConnected(false);
      setSwitchError(null);
      setIsStatusLoading(false);
      return;
    }

    const getLatestRow = (rows: BaserowConfigRow[]): BaserowConfigRow => {
      return rows.reduce(
        (current, candidate) => (candidate.id > current.id ? candidate : current),
        rows[0],
      );
    };

    const normalizePhone = (row: BaserowConfigRow): string => {
      const waba =
        (row["body.waba_phone_number"] as string | undefined) ??
        (row["body.tenant.wabaPhoneNumber"] as string | undefined) ??
        "";
      return waba.trim();
    };

    const normalizeAgentStates = (states: AgentStateRow[], target: string) => {
      if (!states.length) {
        return states;
      }
      const filtered = states.filter(
        (entry) => (entry.numero ?? "").trim() === target,
      );
      return filtered.length > 0 ? filtered : states;
    };

    const loadConnectionStatus = async () => {
      setIsStatusLoading(true);
      setSwitchError(null);

      try {
        const baserowConfigs = await getBaserowConfigs(institutionId);
        if (isCancelled) return;

        if (!baserowConfigs.length) {
          setPhoneNumber(null);
          setIsAgentConnected(false);
          return;
        }

        const latestRow = getLatestRow(baserowConfigs);
        const normalizedPhone = normalizePhone(latestRow);
        setPhoneNumber(normalizedPhone || null);

        const iaAtivada = String(latestRow.ia_ativada ?? "")
          .trim()
          .toLowerCase();
        const hasIaAtivada = iaAtivada !== "" && iaAtivada !== "null" && iaAtivada !== "undefined";
        const iaAtivadaValue = iaAtivada === "sim" || iaAtivada === "yes" || iaAtivada === "true";

        if (!normalizedPhone) {
          setIsAgentConnected(false);
          return;
        }

        let nextState = false;

        if (hasIaAtivada) {
          nextState = iaAtivadaValue;
        } else {
          try {
            const agentStates = await getAgentStateRows(normalizedPhone);
            if (isCancelled) return;
            const relevantStates = normalizeAgentStates(
              agentStates,
              normalizedPhone,
            );

            if (relevantStates.length > 0) {
              const latestState = relevantStates.reduce(
                (current, candidate) =>
                  candidate.id > current.id ? candidate : current,
                relevantStates[0],
              );
              const estado = String(latestState.estado ?? "")
                .trim()
                .toLowerCase();
              if (estado === "inativo") {
                nextState = false;
              } else if (estado === "ativo") {
                nextState = true;
              }
            }
          } catch {
            if (!isCancelled) {
              setSwitchError("Nao foi possivel carregar o estado do agente");
            }
          }
        }

        if (!isCancelled) {
          setIsAgentConnected(nextState);
        }
      } catch {
        if (!isCancelled) {
          setPhoneNumber(null);
          setIsAgentConnected(false);
          setSwitchError("Nao foi possivel carregar o estado do agente");
        }
      } finally {
        if (!isCancelled) {
          setIsStatusLoading(false);
        }
      }
    };

    loadConnectionStatus();

    return () => {
      isCancelled = true;
    };
  }, [institutionId, isMounted]);

  const handleAgentStateChange = async (checked: boolean) => {
    if (!institutionId) {
      return;
    }

    setSwitchError(null);
    setIsUpdatingState(true);
    isManualUpdateRef.current = true;
    const previousState = isAgentConnected;

    setIsAgentConnected(checked);

    try {
      if (phoneNumber) {
        try {
          await registerAgentState({
            numero: phoneNumber,
            estado: checked ? "ativo" : "inativo",
          });
        } catch {
          // Nao bloquear a atualizacao de ia_ativada
        }
      }

      await updateIaAtivada(institutionId, checked ? "sim" : "não");
    } catch {
      setIsAgentConnected(previousState);
      setSwitchError("Nao foi possivel atualizar o estado");
    } finally {
      setIsUpdatingState(false);
      setTimeout(() => {
        isManualUpdateRef.current = false;
      }, 1000);
    }
  };

  const hasAuth = isMounted && data.auth;
  const isProcessingState = isStatusLoading || isUpdatingState;
  const isSwitchDisabled = !institutionId || isProcessingState;
  const connectionLabel = isAgentConnected ? "I.A. Conectada" : "I.A. Desconectada";

  if (!hasAuth) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-[#D4E0EB] dark:bg-background/95 backdrop-blur dark:supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
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

        {/* Right: AI toggle + Dark mode */}
        <div className="flex items-center gap-3">
          {/* AI Connection Toggle */}
          <div className="flex flex-col gap-1">
            <div
              className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-sm font-medium"
              title={
                phoneNumber
                  ? `Estado do agente para ${phoneNumber}`
                  : "Defina o numero waba nas configuracoes para habilitar o controle"
              }
            >
              <Switch
                checked={isAgentConnected}
                onCheckedChange={(checked) => {
                  if (!isSwitchDisabled) {
                    handleAgentStateChange(checked);
                  }
                }}
                disabled={isSwitchDisabled}
                aria-label="Alternar o estado de conexao do agente"
              />
              <span
                className={
                  isAgentConnected
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }
              >
                <span className="hidden sm:inline">{connectionLabel}</span>
                <span className="sm:hidden">
                  {isAgentConnected ? "On" : "Off"}
                </span>
              </span>
              {isProcessingState ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            {switchError ? (
              <span className="text-[11px] font-medium text-destructive">
                {switchError}
              </span>
            ) : null}
          </div>

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

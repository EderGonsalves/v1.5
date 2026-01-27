"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, Plug, LogOut, FileText, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import {
  getAgentStateRows,
  getBaserowConfigs,
  registerAgentState,
  updateIaAtivada,
  type AgentStateRow,
  type BaserowConfigRow,
} from "@/services/api";

export const Header = () => {
  const router = useRouter();
  const { logout, data } = useOnboarding();
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

    // Se estamos fazendo uma atualização manual, não recarregar o estado
    if (isManualUpdateRef.current) {
      console.log("Atualização manual em andamento, pulando recarregamento do estado");
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
        
        console.log("Header - latestRow encontrado:", latestRow.id);
        console.log("Header - normalizedPhone:", normalizedPhone);
        console.log("Header - latestRow.ia_ativada:", latestRow.ia_ativada);

        // Verificar o valor de ia_ativada (prioridade)
        const iaAtivada = String(latestRow.ia_ativada ?? "")
          .trim()
          .toLowerCase();
        const hasIaAtivada = iaAtivada !== "" && iaAtivada !== "null" && iaAtivada !== "undefined";
        const iaAtivadaValue = iaAtivada === "sim" || iaAtivada === "yes" || iaAtivada === "true";
        
        console.log("Header - ia_ativada processado:", iaAtivada, "hasIaAtivada:", hasIaAtivada, "iaAtivadaValue:", iaAtivadaValue);

        if (!normalizedPhone) {
          setIsAgentConnected(false);
          return;
        }

        let nextState = false;

        // Se ia_ativada estiver definido, usar ele como fonte de verdade
        if (hasIaAtivada) {
          nextState = iaAtivadaValue;
          console.log("Usando valor de ia_ativada:", iaAtivada, "->", nextState);
        } else {
          // Caso contrário, usar o estado do agente como fallback
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
              console.log("Usando estado do agente como fallback:", estado, "->", nextState);
            }
          } catch (stateError) {
            console.error("Falha ao buscar EstadoAgente:", stateError);
            if (!isCancelled) {
              setSwitchError("Nao foi possivel carregar o estado do agente");
            }
          }
        }

        if (!isCancelled) {
          setIsAgentConnected(nextState);
        }
      } catch (error) {
        console.error("Falha ao carregar configuracoes do Baserow:", error);
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

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleAgentStateChange = async (checked: boolean) => {
    if (!institutionId) {
      console.warn("handleAgentStateChange: institutionId não disponível");
      return;
    }
    
    console.log("handleAgentStateChange chamado com checked:", checked);
    setSwitchError(null);
    setIsUpdatingState(true);
    isManualUpdateRef.current = true; // Marcar que estamos fazendo uma atualização manual
    const previousState = isAgentConnected;
    
    // Atualizar o estado local imediatamente para feedback visual
    setIsAgentConnected(checked);
    console.log("Estado local atualizado para:", checked);

    try {
      // Atualizar o estado do agente na tabela EstadoAgente (apenas se houver phoneNumber)
      if (phoneNumber) {
        console.log("Atualizando estado do agente na tabela EstadoAgente...");
        try {
          await registerAgentState({
            numero: phoneNumber,
            estado: checked ? "ativo" : "inativo",
          });
        } catch (agentError) {
          console.warn("Erro ao atualizar estado do agente (continuando):", agentError);
          // Não bloquear a atualização de ia_ativada se houver erro no estado do agente
        }
      } else {
        console.log("PhoneNumber não disponível, pulando atualização do estado do agente");
      }

      // Atualizar o campo ia_ativada na tabela 224 (sempre)
      console.log("Atualizando campo ia_ativada na tabela 224...");
      await updateIaAtivada(institutionId, checked ? "sim" : "não");
      
      console.log("Campo ia_ativada atualizado com sucesso");
    } catch (error) {
      console.error("Falha ao atualizar estado:", error);
      setIsAgentConnected(previousState);
      setSwitchError("Nao foi possivel atualizar o estado");
    } finally {
      setIsUpdatingState(false);
      // Resetar a flag após um pequeno delay para permitir que a atualização seja processada
      setTimeout(() => {
        isManualUpdateRef.current = false;
        console.log("Flag de atualização manual resetada");
      }, 1000);
    }
  };

  const hasAuth = isMounted && data.auth;
  const isProcessingState = isStatusLoading || isUpdatingState;
  // Permitir que o switch funcione mesmo sem phoneNumber, apenas para atualizar ia_ativada
  const isSwitchDisabled = !institutionId || isProcessingState;
  const connectionLabel = isAgentConnected ? "I.A. Conectada" : "I.A. Desconectada";
  
  console.log("Header render - isAgentConnected:", isAgentConnected, "isSwitchDisabled:", isSwitchDisabled, "phoneNumber:", phoneNumber, "institutionId:", institutionId);

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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
                    console.log("Switch onCheckedChange chamado com:", checked);
                    console.log("isSwitchDisabled:", isSwitchDisabled);
                    console.log("phoneNumber:", phoneNumber);
                    console.log("institutionId:", institutionId);
                    if (!isSwitchDisabled) {
                      handleAgentStateChange(checked);
                    } else {
                      console.warn("Switch está desabilitado, não é possível alterar o estado");
                    }
                  }}
                  disabled={isSwitchDisabled}
                  aria-label="Alternar o estado de conexao do agente"
                />
                <span
                  className={
                    isAgentConnected
                      ? "text-emerald-600"
                      : "text-muted-foreground"
                  }
                >
                  {connectionLabel}
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
              <Link href="/estatisticas">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Estatísticas</span>
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
          </div>
        )}
      </div>
    </header>
  );
};

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import {
  getBaserowConfigs,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  type WebhookRow,
} from "@/services/api";
import { Bell, Pencil, Plus, Trash2, Webhook } from "lucide-react";

// WhatsApp OAuth configuration - usando variáveis de ambiente
const WHATSAPP_OAUTH_BASE_URL = "https://www.facebook.com/v22.0/dialog/oauth";
const WHATSAPP_CLIENT_ID = process.env.NEXT_PUBLIC_WHATSAPP_CLIENT_ID || "";
const WHATSAPP_REDIRECT_URI = process.env.NEXT_PUBLIC_WHATSAPP_REDIRECT_URI || "";
const WHATSAPP_CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || "";

const buildWhatsAppOAuthUrl = (institutionId: number): string => {
  const state = institutionId.toString();
  const params = new URLSearchParams({
    client_id: WHATSAPP_CLIENT_ID,
    redirect_uri: WHATSAPP_REDIRECT_URI,
    state,
    config_id: WHATSAPP_CONFIG_ID,
    response_type: "code",
    override_default_response_type: "true",
    extras: JSON.stringify({
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
      version: "v4",
    }),
  });

  return `${WHATSAPP_OAUTH_BASE_URL}?${params.toString()}`;
};

type ConnectedNumber = {
  id: number;
  phoneNumber: string;
};

type WebhookFormData = {
  webhook_url: string;
  webhook_name: string;
  webhook_secret: string;
  alert_depoimento_inicial: boolean;
  alert_etapa_perguntas: boolean;
  alert_etapa_final: boolean;
  is_active: boolean;
};

const emptyWebhookForm: WebhookFormData = {
  webhook_url: "",
  webhook_name: "",
  webhook_secret: "",
  alert_depoimento_inicial: true,
  alert_etapa_perguntas: true,
  alert_etapa_final: true,
  is_active: true,
};

export default function ConexoesPage() {
  const router = useRouter();
  const { data, isHydrated, updateSection } = useOnboarding();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedNumbers, setConnectedNumbers] = useState<ConnectedNumber[]>([]);
  const [isLoadingWaba, setIsLoadingWaba] = useState(false);

  // Webhook states
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookRow | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookFormData>(emptyWebhookForm);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [deletingWebhookId, setDeletingWebhookId] = useState<number | null>(null);
  const [togglingWebhookId, setTogglingWebhookId] = useState<number | null>(null);

  // Fetch webhooks
  const fetchWebhooks = useCallback(async () => {
    if (!data.auth?.institutionId) return;

    setIsLoadingWebhooks(true);
    setWebhookError(null);
    try {
      const result = await getWebhooks(data.auth.institutionId);
      setWebhooks(result);
    } catch (error) {
      console.error("Erro ao buscar webhooks:", error);
      setWebhookError(
        error instanceof Error ? error.message : "Erro ao buscar webhooks"
      );
    } finally {
      setIsLoadingWebhooks(false);
    }
  }, [data.auth?.institutionId]);

  // Buscar os números WABA do Baserow
  useEffect(() => {
    const fetchWabaNumbers = async () => {
      if (!data.auth?.institutionId) return;

      setIsLoadingWaba(true);
      try {
        const configs = await getBaserowConfigs(data.auth.institutionId);
        const numbers: ConnectedNumber[] = [];

        configs.forEach((config) => {
          const phoneNumber = config.waba_phone_number;
          if (phoneNumber) {
            const normalizedPhone = typeof phoneNumber === "string"
              ? phoneNumber.trim()
              : String(phoneNumber);
            if (normalizedPhone) {
              numbers.push({
                id: config.id,
                phoneNumber: normalizedPhone,
              });
            }
          }
        });

        setConnectedNumbers(numbers);
      } catch (error) {
        console.error("Erro ao buscar números WABA:", error);
      } finally {
        setIsLoadingWaba(false);
      }
    };

    fetchWabaNumbers();
    fetchWebhooks();
  }, [data.auth?.institutionId, fetchWebhooks]);

  const handleOpenWebhookDialog = (webhook?: WebhookRow) => {
    if (webhook) {
      setEditingWebhook(webhook);
      const activeValue = webhook.webhook_active?.trim().toLowerCase() ?? "";
      const isActive = ["sim", "yes", "true", "1", "ativo"].includes(activeValue);
      setWebhookForm({
        webhook_url: webhook.webhook_url ?? "",
        webhook_name: webhook.webhook_name ?? "",
        webhook_secret: webhook.webhook_secret ?? "",
        alert_depoimento_inicial: webhook.alert_depoimento_inicial ?? true,
        alert_etapa_perguntas: webhook.alert_etapa_perguntas ?? true,
        alert_etapa_final: webhook.alert_etapa_final ?? true,
        is_active: isActive,
      });
    } else {
      setEditingWebhook(null);
      setWebhookForm(emptyWebhookForm);
    }
    setIsWebhookDialogOpen(true);
  };

  const handleCloseWebhookDialog = () => {
    setIsWebhookDialogOpen(false);
    setEditingWebhook(null);
    setWebhookForm(emptyWebhookForm);
  };

  const handleSaveWebhook = async () => {
    if (!data.auth?.institutionId) return;
    if (!webhookForm.webhook_url.trim()) {
      alert("A URL do webhook é obrigatória");
      return;
    }

    setIsSavingWebhook(true);
    try {
      const { is_active, ...rest } = webhookForm;
      const payload = {
        ...rest,
        webhook_active: is_active ? "sim" : "não",
      };

      if (editingWebhook) {
        await updateWebhook(editingWebhook.id, payload);
      } else {
        await createWebhook({
          webhoock_institution_id: data.auth.institutionId,
          ...payload,
        });
      }
      await fetchWebhooks();
      handleCloseWebhookDialog();
    } catch (error) {
      console.error("Erro ao salvar webhook:", error);
      alert(error instanceof Error ? error.message : "Erro ao salvar webhook");
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: number) => {
    if (!confirm("Tem certeza que deseja excluir este webhook?")) return;

    setDeletingWebhookId(webhookId);
    try {
      await deleteWebhook(webhookId);
      await fetchWebhooks();
    } catch (error) {
      console.error("Erro ao excluir webhook:", error);
      alert(error instanceof Error ? error.message : "Erro ao excluir webhook");
    } finally {
      setDeletingWebhookId(null);
    }
  };

  const isWebhookActive = (value: string | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return ["sim", "yes", "true", "1", "ativo"].includes(normalized);
  };

  const handleToggleWebhookActive = async (webhook: WebhookRow) => {
    setTogglingWebhookId(webhook.id);
    try {
      const currentlyActive = isWebhookActive(webhook.webhook_active);
      await updateWebhook(webhook.id, {
        webhook_active: currentlyActive ? "não" : "sim",
      });
      await fetchWebhooks();
    } catch (error) {
      console.error("Erro ao alterar status do webhook:", error);
    } finally {
      setTogglingWebhookId(null);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }

    // Listener para mensagens do popup
    const handleMessage = (event: MessageEvent) => {
      // Verificar se a mensagem é do popup de OAuth
      if (event.origin !== "https://www.facebook.com" && 
          event.origin !== "https://automation-webhook.riasistemas.com.br") {
        return;
      }

      console.log("Mensagem recebida do popup:", event.data);
      
      // Se a conexão foi bem-sucedida, atualizar o estado
      if (event.data?.type === "whatsapp_connected" || event.data?.connected) {
        updateSection({
          connections: {
            ...data.connections,
            whatsApp: {
              connected: true,
              connectedAt: new Date().toISOString(),
            },
          },
        });
        setIsConnecting(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isHydrated, data.auth, router, data.connections, updateSection]);

  const handleWhatsAppConnect = () => {
    if (!data.auth?.institutionId) {
      console.error("Institution ID não encontrado");
      return;
    }

    setIsConnecting(true);
    const oauthUrl = buildWhatsAppOAuthUrl(data.auth.institutionId);
    console.log("Abrindo popup para OAuth WhatsApp:", oauthUrl);

    // Abrir em popup
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      oauthUrl,
      "whatsapp-oauth",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      console.error("Popup bloqueado. Verifique as configurações do navegador.");
      setIsConnecting(false);
      return;
    }

    // Verificar se o popup foi fechado ou redirecionado
    const checkPopupStatus = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopupStatus);
        setIsConnecting(false);
        console.log("Popup fechado - assumindo que conexão foi concluída");
        
        // Quando o popup fecha, assumimos que o processo foi concluído
        // O webhook processa a conexão no backend
        // Atualizar o estado localmente após um pequeno delay para dar tempo ao webhook processar
        setTimeout(() => {
          updateSection({
            connections: {
              ...data.connections,
              whatsApp: {
                connected: true,
                connectedAt: new Date().toISOString(),
              },
            },
          });
        }, 1000);
        return;
      }

      try {
        // Tentar verificar se o popup foi redirecionado para o redirect_uri
        // Isso indica que a autorização foi concluída
        // Nota: Isso pode falhar devido a políticas de segurança do navegador (cross-origin)
        if (popup.location.href.includes("automation-webhook.riasistemas.com.br")) {
          console.log("Popup redirecionado para webhook - fechando popup");
          clearInterval(checkPopupStatus);
          
          // Dar um tempo para o webhook processar antes de fechar
          setTimeout(() => {
            if (!popup.closed) {
              popup.close();
            }
            setIsConnecting(false);
            
            // Atualizar estado da conexão
            updateSection({
              connections: {
                ...data.connections,
                whatsApp: {
                  connected: true,
                  connectedAt: new Date().toISOString(),
                },
              },
            });
          }, 1000);
        }
      } catch (e) {
        // Erro esperado quando tentamos acessar location de outro domínio
        // Isso é normal durante o processo de OAuth (cross-origin policy)
        // Continuamos verificando se o popup foi fechado
      }
    }, 500);

    // Limpar o intervalo após 5 minutos (timeout de segurança)
    setTimeout(() => {
      clearInterval(checkPopupStatus);
      if (!popup.closed) {
        popup.close();
      }
      setIsConnecting(false);
    }, 300000); // 5 minutos
  };

  if (!isHydrated || !data.auth) {
    return null;
  }

  return (
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Conexões
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Gerencie suas conexões
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Conecte os canais de comunicação que o agente utilizará para atender seus clientes.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Canais de Comunicação</CardTitle>
            <CardDescription>
              Instituição #{data.auth.institutionId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* WhatsApp Business - Botão de conexão */}
              <div className="rounded-lg border border-border/60 bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                        <svg
                          className="h-6 w-6 text-green-600"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.191 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">WhatsApp Business</h4>
                        <p className="text-sm text-muted-foreground">
                          Conecte sua conta do WhatsApp Business para o agente atender clientes pelo WhatsApp
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button
                      type="button"
                      onClick={handleWhatsAppConnect}
                      disabled={isConnecting || !data.auth?.institutionId}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isConnecting ? "Conectando..." : "Conectar novo número"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Números conectados */}
              {isLoadingWaba ? (
                <div className="rounded-lg border border-border/60 bg-card p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ) : connectedNumbers.length > 0 ? (
                connectedNumbers.map((connection) => (
                  <div
                    key={connection.id}
                    className="rounded-lg border border-green-200 bg-green-50/50 p-6 dark:border-green-900 dark:bg-green-950/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                          <svg
                            className="h-6 w-6 text-green-600"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.191 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">
                            {connection.phoneNumber}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Número conectado ao WhatsApp Business
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-1.5 text-sm text-green-700 dark:text-green-400">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Conectado
                      </div>
                    </div>
                  </div>
                ))
              ) : null}

              {/* Placeholder para futuras conexões */}
              <Separator />

              <div className="rounded-lg border border-border/60 bg-muted/30 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <svg
                          className="h-6 w-6 text-muted-foreground"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">Mais conexões em breve</h4>
                        <p className="text-sm text-muted-foreground">
                          Novos canais de comunicação serão adicionados em breve
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                    >
                      Em breve
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">Importante</p>
              <p className="mt-1 text-xs">
                Ao clicar em &quot;Conectar&quot;, uma janela popup será aberta para autorização
                do Meta/Facebook. Após autorizar, a janela será fechada automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhooks / Alertas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Webhooks de Alertas
                </CardTitle>
                <CardDescription>
                  Configure endpoints para receber notificações quando os casos mudarem de etapa
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenWebhookDialog()} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Webhook
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingWebhooks ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-card p-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                      <div className="space-y-2">
                        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : webhookError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {webhookError}
              </div>
            ) : webhooks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-8 text-center">
                <Webhook className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h4 className="mt-4 font-semibold text-foreground">
                  Nenhum webhook configurado
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adicione um webhook para receber alertas quando os casos mudarem de etapa.
                </p>
                <Button
                  onClick={() => handleOpenWebhookDialog()}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Configurar primeiro webhook
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {webhooks.map((webhook) => {
                  const webhookActive = isWebhookActive(webhook.webhook_active);
                  return (
                  <div
                    key={webhook.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      webhookActive
                        ? "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20"
                        : "border-border/60 bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                              webhookActive
                                ? "bg-green-500/10"
                                : "bg-muted"
                            }`}
                          >
                            <Bell
                              className={`h-5 w-5 ${
                                webhookActive
                                  ? "text-green-600"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div>
                            <h4 className="font-semibold text-foreground">
                              {webhook.webhook_name || "Webhook sem nome"}
                            </h4>
                            <p className="text-xs text-muted-foreground font-mono break-all">
                              {webhook.webhook_url}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-13">
                          {webhook.alert_depoimento_inicial && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                              Depoimento Inicial
                            </span>
                          )}
                          {webhook.alert_etapa_perguntas && (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                              Etapa Perguntas
                            </span>
                          )}
                          {webhook.alert_etapa_final && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
                              Etapa Final
                            </span>
                          )}
                          {webhook.last_status && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                webhook.last_status === "success"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                                  : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                              }`}
                            >
                              {webhook.last_status === "success"
                                ? "Ultimo envio: OK"
                                : "Ultimo envio: Falha"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={webhookActive}
                          onCheckedChange={() => handleToggleWebhookActive(webhook)}
                          disabled={togglingWebhookId === webhook.id}
                          aria-label="Ativar/desativar webhook"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenWebhookDialog(webhook)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          disabled={deletingWebhookId === webhook.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}

            <Separator className="my-6" />

            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">Como funciona</p>
              <p className="mt-1 text-xs">
                Quando um caso mudar de etapa (Depoimento Inicial, Etapa de Perguntas ou Etapa Final),
                um POST será enviado para cada webhook ativo com os dados do caso.
              </p>
              <p className="mt-2 text-xs font-mono bg-amber-100 dark:bg-amber-900/50 p-2 rounded">
                POST /api/alerts {`{ caseId, alertType, institutionId }`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dialog de Webhook */}
        <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingWebhook ? "Editar Webhook" : "Novo Webhook"}
              </DialogTitle>
              <DialogDescription>
                Configure o endpoint que receberá as notificações de alerta.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="webhook_name">Nome do Webhook</Label>
                <Input
                  id="webhook_name"
                  placeholder="Ex: N8N Produção, Make.com, etc."
                  value={webhookForm.webhook_name}
                  onChange={(e) =>
                    setWebhookForm((prev) => ({
                      ...prev,
                      webhook_name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_url">URL do Webhook *</Label>
                <Input
                  id="webhook_url"
                  type="url"
                  placeholder="https://seu-endpoint.com/webhook"
                  value={webhookForm.webhook_url}
                  onChange={(e) =>
                    setWebhookForm((prev) => ({
                      ...prev,
                      webhook_url: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_secret">
                  Chave Secreta (opcional)
                </Label>
                <Input
                  id="webhook_secret"
                  type="password"
                  placeholder="Chave para autenticação"
                  value={webhookForm.webhook_secret}
                  onChange={(e) =>
                    setWebhookForm((prev) => ({
                      ...prev,
                      webhook_secret: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Se configurada, será enviada no header X-Webhook-Secret
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Alertas a receber</Label>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="alert_depoimento"
                    checked={webhookForm.alert_depoimento_inicial}
                    onCheckedChange={(checked) =>
                      setWebhookForm((prev) => ({
                        ...prev,
                        alert_depoimento_inicial: checked === true,
                      }))
                    }
                  />
                  <label
                    htmlFor="alert_depoimento"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Depoimento Inicial
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="alert_perguntas"
                    checked={webhookForm.alert_etapa_perguntas}
                    onCheckedChange={(checked) =>
                      setWebhookForm((prev) => ({
                        ...prev,
                        alert_etapa_perguntas: checked === true,
                      }))
                    }
                  />
                  <label
                    htmlFor="alert_perguntas"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Etapa de Perguntas
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="alert_final"
                    checked={webhookForm.alert_etapa_final}
                    onCheckedChange={(checked) =>
                      setWebhookForm((prev) => ({
                        ...prev,
                        alert_etapa_final: checked === true,
                      }))
                    }
                  />
                  <label
                    htmlFor="alert_final"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Etapa Final
                  </label>
                </div>
              </div>

              <Separator />

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={webhookForm.is_active}
                  onCheckedChange={(checked) =>
                    setWebhookForm((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="is_active">Webhook ativo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseWebhookDialog}>
                Cancelar
              </Button>
              <Button onClick={handleSaveWebhook} disabled={isSavingWebhook}>
                {isSavingWebhook ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

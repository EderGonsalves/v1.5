"use client";

import { useState, useEffect } from "react";
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
import { useOnboarding } from "@/components/onboarding/onboarding-context";

const WHATSAPP_OAUTH_BASE_URL = "https://www.facebook.com/v22.0/dialog/oauth";
const WHATSAPP_CLIENT_ID = "1990068605120799";
const WHATSAPP_REDIRECT_URI = "https://automation-webhook.riasistemas.com.br/webhook/wa/auth";
const WHATSAPP_CONFIG_ID = "1339029904935343";

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

export default function ConexoesPage() {
  const router = useRouter();
  const { data, updateSection } = useOnboarding();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
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
  }, [data.auth, router, data.connections, updateSection]);

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

  const whatsAppConnected = data.connections?.whatsApp?.connected ?? false;

  if (!data.auth) {
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
              {/* WhatsApp Business */}
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
                    {whatsAppConnected ? (
                      <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-1.5 text-sm text-green-700">
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
                    ) : (
                      <Button
                        type="button"
                        onClick={handleWhatsAppConnect}
                        disabled={isConnecting || !data.auth?.institutionId}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isConnecting ? "Conectando..." : "Conectar"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

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
                Ao clicar em "Conectar", uma janela popup será aberta para autorização
                do Meta/Facebook. Após autorizar, a janela será fechada automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}



"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, RefreshCw, Send, Trash2, Users } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchPushHistory } from "@/services/push-client";

type NotificationRecord = {
  id: number;
  title: string;
  body: string;
  url: string;
  sent_by_name: string;
  sent_at: string;
  recipients_count: number;
  status: string;
};

type SubscriptionInfo = {
  id: number;
  user_email: string;
  user_name: string;
  legacy_user_id: string;
  institution_id: number;
  endpoint_type: "LEGACY" | "VAPID";
  endpoint_preview: string;
  created_at: string;
};

type SubsResponse = {
  total: number;
  legacy: number;
  vapid: number;
  subscriptions: SubscriptionInfo[];
};

type SendDiagnostic = {
  total_subscriptions: number;
  legacy_filtered: number;
  vapid_attempted: number;
  endpoints: { id: number; type: string; endpoint: string; user: string }[];
  errors: string[];
};

type SendResponse = {
  sent: number;
  failed: number;
  diagnostic: SendDiagnostic;
};

export default function NotificacoesPage() {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId;

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/casos");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [lastDiagnostic, setLastDiagnostic] = useState<SendDiagnostic | null>(
    null,
  );

  // Subscriptions state
  const [subs, setSubs] = useState<SubsResponse | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Cleanup state
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchPushHistory();
      setHistory(data.results as unknown as NotificationRecord[]);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const res = await fetch("/api/v1/push/subscriptions");
      if (res.ok) {
        const data: SubsResponse = await res.json();
        setSubs(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    if (institutionId === 4) {
      loadHistory();
      loadSubs();
    }
  }, [institutionId, loadHistory, loadSubs]);

  if (institutionId !== 4) {
    return (
      <main className="min-h-screen bg-background py-4">
        <div className="mx-auto max-w-5xl px-4">
          <div className="text-center py-16">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h2 className="mt-4 text-sm font-semibold">Acesso restrito</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Esta página é exclusiva para administradores do sistema.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;

    setSending(true);
    setFeedback(null);
    setLastDiagnostic(null);

    try {
      const res = await fetch("/api/v1/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/casos",
          institution_id: 0,
        }),
      });
      const result: SendResponse = await res.json();

      if (!res.ok) {
        throw new Error(
          (result as unknown as { error?: string }).error || `Erro ${res.status}`,
        );
      }

      setLastDiagnostic(result.diagnostic);
      setFeedback({
        type: result.sent > 0 ? "success" : "error",
        message: `Enviado: ${result.sent} | Falhas: ${result.failed} | Total: ${result.diagnostic.total_subscriptions} (${result.diagnostic.vapid_attempted} VAPID, ${result.diagnostic.legacy_filtered} legacy)`,
      });
      setTitle("");
      setBody("");
      setUrl("/casos");
      loadHistory();
      loadSubs();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao enviar",
      });
    } finally {
      setSending(false);
    }
  };

  const handleCleanup = async () => {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/v1/push/cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setCleanupResult(data.message);
      loadSubs();
    } catch (err) {
      setCleanupResult(
        err instanceof Error ? err.message : "Erro ao limpar",
      );
    } finally {
      setCleaningUp(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      partial_failure:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-muted text-muted-foreground"}`}
      >
        {status === "sent"
          ? "Enviado"
          : status === "partial_failure"
            ? "Parcial"
            : status === "failed"
              ? "Falhou"
              : status}
      </span>
    );
  };

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto max-w-5xl px-4 space-y-6">
        {/* Header */}
        <div className="border-b border-[#7E99B5] dark:border-border/60 pb-4">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações Push
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envie notificações para todos os dispositivos inscritos.
          </p>
        </div>

        {/* Subscriptions Diagnostic */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Dispositivos inscritos
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={loadSubs}
              disabled={loadingSubs}
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingSubs ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          {subs ? (
            <>
              <div className="flex gap-4 text-sm">
                <span>
                  Total: <strong>{subs.total}</strong>
                </span>
                <span className="text-green-600">
                  VAPID: <strong>{subs.vapid}</strong>
                </span>
                <span className="text-red-600">
                  Legacy: <strong>{subs.legacy}</strong>
                </span>
              </div>
              {subs.subscriptions.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {subs.subscriptions.map((s) => (
                    <div
                      key={s.id}
                      className="text-xs border rounded p-2 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.endpoint_type === "VAPID"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {s.endpoint_type}
                        </span>
                        <span className="font-medium">
                          {s.user_name || s.user_email || s.legacy_user_id || "—"}
                        </span>
                        <span className="text-muted-foreground">
                          inst. {s.institution_id}
                        </span>
                      </div>
                      <p className="text-muted-foreground font-mono break-all">
                        {s.endpoint_preview}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : loadingSubs ? (
            <div className="text-center py-4">
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhum dispositivo inscrito.
            </p>
          )}
        </div>

        {/* Send Form */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Enviar notificação</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Título
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da notificação"
                maxLength={100}
                disabled={sending}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Mensagem
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Corpo da mensagem..."
                rows={3}
                disabled={sending}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                URL de destino (opcional)
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/casos"
                disabled={sending}
              />
            </div>
          </div>

          {feedback && (
            <p
              className={`text-sm ${feedback.type === "success" ? "text-green-600" : "text-destructive"}`}
            >
              {feedback.message}
            </p>
          )}

          {lastDiagnostic && (
            <div className="rounded border bg-muted/50 p-3 space-y-2">
              <p className="text-xs font-semibold">Diagnóstico do envio:</p>
              {lastDiagnostic.endpoints.map((ep) => (
                <div key={ep.id} className="text-xs font-mono">
                  <span
                    className={
                      ep.type === "VAPID" ? "text-green-600" : "text-red-600"
                    }
                  >
                    [{ep.type}]
                  </span>{" "}
                  {ep.user} → {ep.endpoint}
                </div>
              ))}
              {lastDiagnostic.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-destructive">
                    Erros:
                  </p>
                  {lastDiagnostic.errors.map((err, i) => (
                    <p key={i} className="text-xs font-mono text-destructive">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </div>

        {/* Cleanup Legacy */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Manutenção</h2>
          <p className="text-xs text-muted-foreground">
            Remove subscriptions com endpoints legacy (GCM) que não suportam
            VAPID e sempre falham com erro 401 ao enviar.
          </p>
          {cleanupResult && (
            <p className="text-sm text-muted-foreground">{cleanupResult}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanup}
            disabled={cleaningUp}
          >
            {cleaningUp ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Limpar subscriptions legacy
          </Button>
        </div>

        {/* History */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Histórico</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={loadHistory}
              disabled={loadingHistory}
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          {loadingHistory && history.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Carregando...
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma notificação enviada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {n.body}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {n.sent_by_name || "—"} · {formatDate(n.sent_at)} ·{" "}
                      {n.recipients_count} dest.
                    </p>
                  </div>
                  {statusBadge(n.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendPushNotification, fetchPushHistory } from "@/services/push-client";

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

  useEffect(() => {
    if (institutionId === 4) {
      loadHistory();
    }
  }, [institutionId, loadHistory]);

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

    try {
      const result = await sendPushNotification({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/casos",
        institution_id: 0, // all institutions
      });
      setFeedback({
        type: "success",
        message: `Enviado para ${result.sent} dispositivo(s)${result.failed > 0 ? `, ${result.failed} falha(s)` : ""}.`,
      });
      setTitle("");
      setBody("");
      setUrl("/casos");
      loadHistory();
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

"use client";

import { useEffect, useState } from "react";
import { Bell, MessageCircle, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const DISMISS_KEY = "notification_perm_dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function NotificationPermissionModal() {
  const { isSupported, isSubscribed, permission, subscribe } =
    usePushSubscription();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    // If already granted but not subscribed, auto-subscribe silently
    if (permission === "granted" && !isSubscribed) {
      subscribe().catch(() => {});
      return;
    }

    // Only show modal if permission is "default" (never asked)
    if (permission !== "default") return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const ts = Number(dismissed);
      if (Date.now() - ts < COOLDOWN_MS) return;
    }

    const timer = setTimeout(() => setOpen(true), 6000);
    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permission, subscribe]);

  const handleActivate = async () => {
    await subscribe();
    setOpen(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ativar notificações</DialogTitle>
          <DialogDescription>
            Receba alertas importantes diretamente no seu dispositivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <MessageCircle className="h-5 w-5 text-primary shrink-0" />
            <span>Novas mensagens de clientes</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CalendarDays className="h-5 w-5 text-primary shrink-0" />
            <span>Lembretes de compromissos</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Bell className="h-5 w-5 text-primary shrink-0" />
            <span>Atualizações do sistema</span>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleDismiss}>
            Depois
          </Button>
          <Button onClick={handleActivate}>
            <Bell className="h-4 w-4 mr-2" />
            Ativar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

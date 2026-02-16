"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Bell, WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "pwa_install_dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PwaInstallPrompt() {
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isInstallable || isInstalled) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const ts = Number(dismissed);
      if (Date.now() - ts < COOLDOWN_MS) return;
    }

    const timer = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled]);

  const handleInstall = async () => {
    await promptInstall();
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
          <DialogTitle>Instalar Briefing Jurídico</DialogTitle>
          <DialogDescription>
            Adicione o app à sua tela inicial para acesso rápido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <Smartphone className="h-5 w-5 text-primary shrink-0" />
            <span>Acesso rápido pela tela inicial</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Bell className="h-5 w-5 text-primary shrink-0" />
            <span>Receba notificações em tempo real</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <WifiOff className="h-5 w-5 text-primary shrink-0" />
            <span>Funciona mesmo offline</span>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleDismiss}>
            Agora não
          </Button>
          <Button onClick={handleInstall}>
            <Download className="h-4 w-4 mr-2" />
            Instalar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

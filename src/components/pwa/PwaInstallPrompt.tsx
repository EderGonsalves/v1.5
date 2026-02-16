"use client";

import { Download, Smartphone, Bell, WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type PwaInstallPromptProps = {
  open: boolean;
  onDone: () => void;
  onInstall: () => Promise<boolean>;
};

export function PwaInstallPrompt({ open, onDone, onInstall }: PwaInstallPromptProps) {
  const handleInstall = async () => {
    await onInstall();
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDone()}>
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
          <Button variant="outline" onClick={onDone}>
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

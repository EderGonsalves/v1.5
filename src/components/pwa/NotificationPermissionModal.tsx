"use client";

import { Bell, MessageCircle, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type NotificationPermissionModalProps = {
  open: boolean;
  onDone: () => void;
  onSubscribe: () => Promise<boolean>;
};

export function NotificationPermissionModal({
  open,
  onDone,
  onSubscribe,
}: NotificationPermissionModalProps) {
  const handleActivate = async () => {
    await onSubscribe();
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDone()}>
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
          <Button variant="outline" onClick={onDone}>
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

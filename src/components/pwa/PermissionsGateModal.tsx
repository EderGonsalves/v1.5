"use client";

import { useState } from "react";
import { MapPin, Mic, Camera, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";

type PermissionType = "geolocation" | "microphone" | "camera";

const PERMISSION_CONFIG: Record<
  PermissionType,
  { icon: typeof MapPin; label: string; description: string }
> = {
  geolocation: {
    icon: MapPin,
    label: "Localização",
    description:
      "Precisamos da sua localização para registrar o atendimento presencial.",
  },
  microphone: {
    icon: Mic,
    label: "Microfone",
    description:
      "Precisamos do acesso ao microfone para gravar mensagens de áudio.",
  },
  camera: {
    icon: Camera,
    label: "Câmera",
    description:
      "Precisamos do acesso à câmera para capturar fotos de documentos.",
  },
};

type PermissionsGateModalProps = {
  permission: PermissionType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted?: () => void;
  onDenied?: () => void;
};

export function PermissionsGateModal({
  permission,
  open,
  onOpenChange,
  onGranted,
  onDenied,
}: PermissionsGateModalProps) {
  const { requestGeolocation, requestMediaPermission } = usePermissions();
  const [requesting, setRequesting] = useState(false);
  const config = PERMISSION_CONFIG[permission];
  const Icon = config.icon;

  const handleAllow = async () => {
    setRequesting(true);
    try {
      if (permission === "geolocation") {
        await requestGeolocation();
      } else {
        await requestMediaPermission(permission);
      }
      onGranted?.();
      onOpenChange(false);
    } catch {
      onDenied?.();
      onOpenChange(false);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            Permitir {config.label}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => {
              onDenied?.();
              onOpenChange(false);
            }}
            disabled={requesting}
          >
            Cancelar
          </Button>
          <Button onClick={handleAllow} disabled={requesting}>
            {requesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 mr-2" />
            )}
            Permitir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

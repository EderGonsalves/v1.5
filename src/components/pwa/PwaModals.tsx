"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { NotificationPermissionModal } from "./NotificationPermissionModal";

const INSTALL_DISMISS_KEY = "pwa_install_dismissed";
const NOTIF_DISMISS_KEY = "notification_perm_dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDismissed(key: string): boolean {
  const ts = localStorage.getItem(key);
  if (!ts) return false;
  return Date.now() - Number(ts) < COOLDOWN_MS;
}

type ModalPhase = "idle" | "install" | "notification";

export function PwaModals() {
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();
  const { isSupported, isSubscribed, isLoading, permission, subscribe } = usePushSubscription();
  const [phase, setPhase] = useState<ModalPhase>("idle");
  const autoSubscribeDone = useRef(false);

  // Auto-subscribe silently if permission already granted (no modal)
  // Wait for isLoading=false to avoid race condition
  useEffect(() => {
    if (isLoading || !isSupported || autoSubscribeDone.current) return;
    if (permission === "granted" && !isSubscribed) {
      autoSubscribeDone.current = true;
      subscribe().catch(() => {});
    }
  }, [isLoading, isSupported, isSubscribed, permission, subscribe]);

  // Orchestrate modals: install first, then notification, never both
  // Wait for isLoading=false to know the real subscription state
  useEffect(() => {
    if (phase !== "idle" || isLoading) return;

    const timer = setTimeout(() => {
      // 1. Try install prompt first
      if (isInstallable && !isInstalled && !isDismissed(INSTALL_DISMISS_KEY)) {
        setPhase("install");
        return;
      }

      // 2. Then notification prompt (only if permission never asked)
      if (isSupported && permission === "default" && !isSubscribed && !isDismissed(NOTIF_DISMISS_KEY)) {
        setPhase("notification");
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [phase, isLoading, isInstallable, isInstalled, isSupported, permission, isSubscribed]);

  const handleInstallDone = useCallback(() => {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    setPhase("idle");
    // After install modal closes, notification modal may appear after delay
  }, []);

  const handleNotificationDone = useCallback(() => {
    localStorage.setItem(NOTIF_DISMISS_KEY, String(Date.now()));
    setPhase("idle");
  }, []);

  return (
    <>
      <PwaInstallPrompt
        open={phase === "install"}
        onDone={handleInstallDone}
        onInstall={promptInstall}
      />
      <NotificationPermissionModal
        open={phase === "notification"}
        onDone={handleNotificationDone}
        onSubscribe={subscribe}
      />
    </>
  );
}

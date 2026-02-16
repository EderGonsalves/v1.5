"use client";

import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { NotificationPermissionModal } from "./NotificationPermissionModal";

export function PwaModals() {
  return (
    <>
      <PwaInstallPrompt />
      <NotificationPermissionModal />
    </>
  );
}

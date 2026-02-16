"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribePush, unsubscribePush } from "@/services/push-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

/**
 * VAPID public key — safe to hardcode (it's public by definition).
 */
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BH1YQiNZCrXNA0TmA1HT1woAKtAGpi5XkPinUd59VAH1Fp5_DIdpZV6p_nwAmzNzgz8oaYQhxxMB6cwhmLLdl0c";

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // On mount: only CHECK existing subscription. No auto-actions.
  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setIsSupported(supported);

    if (!supported) {
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission);

    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          console.info("[Push] Existing subscription found:", existing.endpoint.slice(0, 80));
          setIsSubscribed(true);
        } else {
          console.info("[Push] No existing subscription");
          setIsSubscribed(false);
        }
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  // subscribe() — called ONLY when user clicks "Ativar" in the modal.
  // Creates subscription once and saves to server.
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const perm = await Notification.requestPermission();
    setPermission(perm);

    if (perm !== "granted") return false;

    if (!VAPID_PUBLIC_KEY) {
      console.error("[Push] VAPID public key not configured");
      return false;
    }

    const reg = await navigator.serviceWorker.ready;

    // If already subscribed in the browser, just confirm state
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      console.info("[Push] Already subscribed, confirming with server");
      // Ensure server has this subscription
      const json = existing.toJSON();
      await subscribePush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
      }).catch(() => {});
      setIsSubscribed(true);
      return true;
    }

    // Create new subscription with VAPID key
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    const json = sub.toJSON();
    console.info("[Push] Created new VAPID subscription:", json.endpoint);
    await subscribePush({
      endpoint: json.endpoint!,
      keys: {
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
      },
    });

    setIsSubscribed(true);
    return true;
  }, [isSupported]);

  // unsubscribe() — called ONLY when user explicitly requests it
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      setIsSubscribed(false);
      return true;
    }

    await unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
    setIsSubscribed(false);
    return true;
  }, [isSupported]);

  return { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe };
}

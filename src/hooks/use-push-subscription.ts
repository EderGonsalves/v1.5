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
 * Legacy GCM endpoints (fcm/send/) don't support VAPID auth.
 * VAPID subscriptions use the /wp/ path.
 */
function isLegacyEndpoint(endpoint: string): boolean {
  return endpoint.includes("/fcm/send/");
}

/**
 * VAPID public key — safe to hardcode (it's public by definition).
 * Env var is preferred but fallback ensures it works even if build-time
 * inlining fails (e.g. Docker cache serving stale layer).
 */
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BH1YQiNZCrXNA0TmA1HT1woAKtAGpi5XkPinUd59VAH1Fp5_DIdpZV6p_nwAmzNzgz8oaYQhxxMB6cwhmLLdl0c";

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

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

    // Check existing subscription; if legacy, remove and re-subscribe with VAPID
    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const existing = await reg.pushManager.getSubscription();

        if (existing && isLegacyEndpoint(existing.endpoint)) {
          console.warn("[Push] Legacy GCM subscription detected, re-subscribing with VAPID");
          try {
            await unsubscribePush(existing.endpoint).catch(() => {});
            await existing.unsubscribe();
          } catch {
            // ignore
          }

          // Auto re-subscribe if permission already granted
          if (Notification.permission === "granted" && VAPID_PUBLIC_KEY) {
            try {
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
              });
              const json = newSub.toJSON();
              console.info("[Push] New VAPID endpoint:", json.endpoint);
              await subscribePush({
                endpoint: json.endpoint!,
                keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
              });
              setIsSubscribed(true);
              console.info("[Push] Re-subscribed with VAPID successfully");
            } catch (err) {
              console.error("[Push] Re-subscribe failed:", err);
            }
          }
        } else if (existing) {
          // Valid VAPID subscription already exists
          console.info("[Push] Existing VAPID subscription found:", existing.endpoint.slice(0, 80));
          setIsSubscribed(true);
        } else {
          // No subscription at all
          console.info("[Push] No existing subscription");
          setIsSubscribed(false);
        }
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

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

    // Remove any existing legacy subscription first
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      if (isLegacyEndpoint(existing.endpoint)) {
        console.warn("[Push] Removing legacy subscription before VAPID subscribe");
        await unsubscribePush(existing.endpoint).catch(() => {});
        await existing.unsubscribe();
      } else {
        // Already subscribed with VAPID — no server call needed
        console.info("[Push] Already subscribed with VAPID, skipping");
        setIsSubscribed(true);
        return true;
      }
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    const json = sub.toJSON();
    console.info("[Push] Created VAPID subscription:", json.endpoint);
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

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

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setIsSupported(supported);

    if (!supported) return;

    setPermission(Notification.permission);

    // Check existing subscription; if legacy, remove and re-subscribe with VAPID
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();

      if (existing && isLegacyEndpoint(existing.endpoint)) {
        console.warn("[Push] Legacy GCM subscription detected, re-subscribing with VAPID");
        try {
          await unsubscribePush(existing.endpoint).catch(() => {});
          await existing.unsubscribe();
        } catch {
          // ignore
        }
        setIsSubscribed(false);

        // Auto re-subscribe if permission already granted
        if (Notification.permission === "granted") {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (vapidKey) {
            try {
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
              });
              const json = newSub.toJSON();
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
        }
        return;
      }

      setIsSubscribed(!!existing);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const perm = await Notification.requestPermission();
    setPermission(perm);

    if (perm !== "granted") return false;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error("[Push] VAPID public key not configured");
      return false;
    }

    const reg = await navigator.serviceWorker.ready;

    // Remove any existing legacy subscription first
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      if (isLegacyEndpoint(existing.endpoint)) {
        await unsubscribePush(existing.endpoint).catch(() => {});
        await existing.unsubscribe();
      } else {
        // Already subscribed with VAPID
        setIsSubscribed(true);
        return true;
      }
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    const json = sub.toJSON();
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

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}

/// <reference lib="webworker" />

const CACHE_NAME = "bj-offline-v1";
const OFFLINE_URL = "/offline";

// ---- Install: pre-cache offline page ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ---- Activate: clean old caches ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch: network-first for navigation, fallback to offline page ----
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || new Response("Offline", { status: 503 }))
    )
  );
});

// ---- Push: show notification ----
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Briefing Jurídico", body: event.data.text() };
  }

  const { title = "Briefing Jurídico", body = "", url = "/casos", icon = "/icons/icon-192x192.png", tag = "bj-push" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      tag,
      data: { url },
    })
  );
});

// ---- Notification click: focus or open window ----
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/casos";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/**
 * Push Notifications — Client-side fetch wrappers
 */

export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  const res = await fetch("/api/v1/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  const res = await fetch("/api/v1/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
}

export async function sendPushNotification(payload: {
  title: string;
  body: string;
  url?: string;
  institution_id?: number;
}): Promise<{ sent: number; failed: number }> {
  const res = await fetch("/api/v1/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function fetchPushHistory(
  page?: number,
): Promise<{ results: Array<Record<string, unknown>>; count: number }> {
  const params = page ? `?page=${page}` : "";
  const res = await fetch(`/api/v1/push/history${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

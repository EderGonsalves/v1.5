/**
 * Push Notifications — Server-side service (web-push + Baserow)
 */

import webpush from "web-push";
import { baserowGet, baserowPost, baserowPatch, baserowDelete } from "./api";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API = process.env.NEXT_PUBLIC_BASEROW_API_URL!;
const SUBSCRIPTIONS_TABLE =
  process.env.BASEROW_PUSH_SUBSCRIPTIONS_TABLE_ID || "254";
const NOTIFICATIONS_TABLE =
  process.env.BASEROW_PUSH_NOTIFICATIONS_TABLE_ID || "255";

const subscriptionsUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/?user_field_names=true`;
const notificationsUrl = `${BASEROW_API}/database/rows/table/${NOTIFICATIONS_TABLE}/?user_field_names=true`;

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:suporte@riasistemas.com.br";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PushSubscriptionRecord = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email: string;
  user_name: string;
  legacy_user_id: string;
  institution_id: number;
  user_agent: string;
  created_at: string;
  updated_at: string;
};

export type PushNotificationRecord = {
  id: number;
  title: string;
  body: string;
  url: string;
  icon: string;
  institution_id: number;
  sent_by_email: string;
  sent_by_name: string;
  sent_at: string;
  recipients_count: number;
  status: string;
  error_log: string;
};

type BaserowList<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function saveSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email: string;
  user_name: string;
  legacy_user_id: string;
  institution_id: number;
  user_agent: string;
}): Promise<PushSubscriptionRecord> {
  const now = new Date().toISOString();

  // Check if endpoint already exists
  const searchUrl = `${subscriptionsUrl}&filter__endpoint__equal=${encodeURIComponent(sub.endpoint)}&size=1`;
  const { data: existing } = await baserowGet<BaserowList<PushSubscriptionRecord>>(searchUrl);

  if (existing.results.length > 0) {
    // Update existing
    const row = existing.results[0];
    const updateUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${row.id}/?user_field_names=true`;
    const { data: updated } = await baserowPatch<PushSubscriptionRecord>(updateUrl, {
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_email: sub.user_email,
      user_name: sub.user_name,
      legacy_user_id: sub.legacy_user_id,
      institution_id: sub.institution_id,
      user_agent: sub.user_agent,
      updated_at: now,
    });
    return updated;
  }

  // Create new
  const { data: created } = await baserowPost<PushSubscriptionRecord>(subscriptionsUrl, {
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    user_email: sub.user_email,
    user_name: sub.user_name,
    legacy_user_id: sub.legacy_user_id,
    institution_id: sub.institution_id,
    user_agent: sub.user_agent,
    created_at: now,
    updated_at: now,
  });
  return created;
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
  const searchUrl = `${subscriptionsUrl}&filter__endpoint__equal=${encodeURIComponent(endpoint)}&size=1`;
  const { data: existing } = await baserowGet<BaserowList<PushSubscriptionRecord>>(searchUrl);

  if (existing.results.length === 0) return false;

  const row = existing.results[0];
  const deleteUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${row.id}/`;
  await baserowDelete(deleteUrl);
  return true;
}

export async function getSubscriptionsByInstitution(
  institutionId: number,
): Promise<PushSubscriptionRecord[]> {
  const results: PushSubscriptionRecord[] = [];
  let nextUrl: string | null = `${subscriptionsUrl}&filter__institution_id__equal=${institutionId}&size=200`;

  while (nextUrl) {
    const resp: { data: BaserowList<PushSubscriptionRecord> } = await baserowGet(nextUrl);
    results.push(...resp.data.results);
    nextUrl = resp.data.next;
  }

  return results;
}

export async function getAllSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const results: PushSubscriptionRecord[] = [];
  let nextUrl: string | null = `${subscriptionsUrl}&size=200`;

  while (nextUrl) {
    const resp: { data: BaserowList<PushSubscriptionRecord> } = await baserowGet(nextUrl);
    results.push(...resp.data.results);
    nextUrl = resp.data.next;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Send push
// ---------------------------------------------------------------------------

type SendResult = {
  sent: number;
  failed: number;
  errors: string[];
};

export async function sendPushToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payload: { title: string; body: string; url?: string; icon?: string; tag?: string },
): Promise<SendResult> {
  const jsonPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const tasks = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired, remove it
        try {
          const deleteUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${sub.id}/`;
          await baserowDelete(deleteUrl);
        } catch {
          // ignore cleanup errors
        }
      }
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${sub.endpoint.slice(0, 60)}... → ${message}`);
    }
  });

  await Promise.all(tasks);
  return { sent, failed, errors };
}

// ---------------------------------------------------------------------------
// Notification history
// ---------------------------------------------------------------------------

export async function createNotificationRecord(record: {
  title: string;
  body: string;
  url: string;
  icon: string;
  institution_id: number;
  sent_by_email: string;
  sent_by_name: string;
  recipients_count: number;
  status: string;
  error_log: string;
}): Promise<PushNotificationRecord> {
  const { data: created } = await baserowPost<PushNotificationRecord>(notificationsUrl, {
    ...record,
    sent_at: new Date().toISOString(),
  });
  return created;
}

export async function getNotificationHistory(opts?: {
  page?: number;
  size?: number;
}): Promise<{ results: PushNotificationRecord[]; count: number }> {
  const page = opts?.page || 1;
  const size = opts?.size || 20;
  const url = `${notificationsUrl}&size=${size}&page=${page}`;
  const { data } = await baserowGet<BaserowList<PushNotificationRecord>>(url);
  return { results: data.results, count: data.count };
}

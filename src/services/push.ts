/**
 * Push Notifications — Server-side service (web-push + PostgreSQL/Baserow)
 */

import webpush from "web-push";
import { eq, and, like, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { prepared } from "@/lib/db/prepared";
import { pushSubscriptions } from "@/lib/db/schema/pushSubscriptions";
import { pushNotifications } from "@/lib/db/schema/pushNotifications";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
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

const vapidPublicKey =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BH1YQiNZCrXNA0TmA1HT1woAKtAGpi5XkPinUd59VAH1Fp5_DIdpZV6p_nwAmzNzgz8oaYQhxxMB6cwhmLLdl0c";
const vapidPrivateKey =
  process.env.VAPID_PRIVATE_KEY ||
  "9KN6f2dJU0uXXYbZPqzrsuMbKFvkKK9BFJYDxWgCIeE";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:suporte@riasistemas.com.br";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

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

function isLegacyEndpoint(endpoint: string): boolean {
  return endpoint.includes("/fcm/send/");
}

/** Map Drizzle row → PushSubscriptionRecord (snake_case fields for API compat) */
function mapSubRow(row: typeof pushSubscriptions.$inferSelect): PushSubscriptionRecord {
  return {
    id: row.id,
    endpoint: row.endpoint || "",
    p256dh: row.p256dh || "",
    auth: row.auth || "",
    user_email: row.userEmail || "",
    user_name: row.userName || "",
    legacy_user_id: row.legacyUserId || "",
    institution_id: Number(row.institutionId) || 0,
    user_agent: row.userAgent || "",
    created_at: row.createdAt || "",
    updated_at: row.updatedAt || "",
  };
}

function mapNotifRow(row: typeof pushNotifications.$inferSelect): PushNotificationRecord {
  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    url: row.url || "",
    icon: row.icon || "",
    institution_id: Number(row.institutionId) || 0,
    sent_by_email: row.sentByEmail || "",
    sent_by_name: row.sentByName || "",
    sent_at: row.sentAt || "",
    recipients_count: Number(row.recipientsCount) || 0,
    status: row.status || "",
    error_log: row.errorLog || "",
  };
}

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

  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      // 1. Check existing by endpoint
      const [existing] = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .limit(1);
  
      if (existing) {
        const [updated] = await db
          .update(pushSubscriptions)
          .set({
            p256dh: sub.p256dh,
            auth: sub.auth,
            userEmail: sub.user_email,
            userName: sub.user_name,
            legacyUserId: sub.legacy_user_id,
            institutionId: String(sub.institution_id),
            userAgent: sub.user_agent,
            updatedAt: now,
          })
          .where(eq(pushSubscriptions.id, existing.id))
          .returning();
        console.info(`[Push] Updated existing subscription row ${existing.id}`);
        return mapSubRow(updated);
      }
  
      // 2. Cleanup old subscriptions for this user
      const identifier = sub.legacy_user_id || sub.user_email;
      if (identifier) {
        const filterCol = sub.legacy_user_id
          ? pushSubscriptions.legacyUserId
          : pushSubscriptions.userEmail;
        const oldSubs = await db
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(filterCol, identifier));
        for (const old of oldSubs) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, old.id));
          console.info(`[Push] Deleted old subscription row ${old.id}`);
        }
      }
  
      // 3. Create new
      const [created] = await db
        .insert(pushSubscriptions)
        .values({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          userEmail: sub.user_email,
          userName: sub.user_name,
          legacyUserId: sub.legacy_user_id,
          institutionId: String(sub.institution_id),
          userAgent: sub.user_agent,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      console.info(`[Push] Created new subscription row ${created.id}`);
      return mapSubRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const endpointSearchUrl = `${subscriptionsUrl}&filter__endpoint__equal=${encodeURIComponent(sub.endpoint)}&size=1`;
  try {
    const { data: existing } = await baserowGet<BaserowList<PushSubscriptionRecord>>(endpointSearchUrl);
    if (existing.results.length > 0) {
      const row = existing.results[0];
      const patchUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${row.id}/?user_field_names=true`;
      const { data: updated } = await baserowPatch<PushSubscriptionRecord>(patchUrl, {
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_email: sub.user_email,
        user_name: sub.user_name,
        legacy_user_id: sub.legacy_user_id,
        institution_id: sub.institution_id,
        user_agent: sub.user_agent,
        updated_at: now,
      });
      console.info(`[Push] Updated existing subscription row ${row.id}`);
      return updated;
    }
  } catch {
    // fall through
  }

  const identifier = sub.legacy_user_id || sub.user_email;
  if (identifier) {
    const filterField = sub.legacy_user_id ? "legacy_user_id" : "user_email";
    const cleanupUrl = `${subscriptionsUrl}&filter__${filterField}__equal=${encodeURIComponent(identifier)}&size=200`;
    try {
      const { data: oldSubs } = await baserowGet<BaserowList<PushSubscriptionRecord>>(cleanupUrl);
      for (const old of oldSubs.results) {
        const deleteUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${old.id}/`;
        await baserowDelete(deleteUrl).catch(() => {});
      }
    } catch {
      // ignore cleanup errors
    }
  }

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
  console.info(`[Push] Created new subscription row ${created.id}`);
  return created;
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const [existing] = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);
      if (!existing) return false;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, existing.id));
      return true;
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
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
  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await prepared.getSubsByInstitution.execute({
        institutionId: String(institutionId),
      });
      return rows.map(mapSubRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
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
  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db.select().from(pushSubscriptions);
      return rows.map(mapSubRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
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
// Cleanup legacy subscriptions
// ---------------------------------------------------------------------------

export async function cleanupLegacySubscriptions(): Promise<{ deleted: number; kept: number }> {
  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const legacy = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(like(pushSubscriptions.endpoint, "%/fcm/send/%"));
      for (const row of legacy) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
      }
      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(pushSubscriptions);
      return { deleted: legacy.length, kept: Number(total[0]?.count ?? 0) };
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const allSubs = await getAllSubscriptions();
  let deleted = 0;
  let kept = 0;
  for (const sub of allSubs) {
    if (isLegacyEndpoint(sub.endpoint)) {
      try {
        const deleteUrl = `${BASEROW_API}/database/rows/table/${SUBSCRIPTIONS_TABLE}/${sub.id}/`;
        await baserowDelete(deleteUrl);
        deleted++;
      } catch {
        // ignore
      }
    } else {
      kept++;
    }
  }
  return { deleted, kept };
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
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`row:${sub.id} ${sub.endpoint.slice(0, 60)}... → [${statusCode || "?"}] ${message}`);
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
  const now = new Date().toISOString();

  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(pushNotifications)
        .values({
          title: record.title,
          body: record.body,
          url: record.url,
          icon: record.icon,
          institutionId: String(record.institution_id),
          sentByEmail: record.sent_by_email,
          sentByName: record.sent_by_name,
          sentAt: now,
          recipientsCount: String(record.recipients_count),
          status: record.status,
          errorLog: record.error_log,
        })
        .returning();
      return mapNotifRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const { data: created } = await baserowPost<PushNotificationRecord>(notificationsUrl, {
    ...record,
    sent_at: now,
  });
  return created;
}

export async function getNotificationHistory(opts?: {
  page?: number;
  size?: number;
}): Promise<{ results: PushNotificationRecord[]; count: number }> {
  const page = opts?.page || 1;
  const size = opts?.size || 20;

  if (useDirectDb("push")) {
    const _dr = await tryDrizzle(async () => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pushNotifications);
      const rows = await db
        .select()
        .from(pushNotifications)
        .orderBy(desc(pushNotifications.id))
        .limit(size)
        .offset((page - 1) * size);
      return { results: rows.map(mapNotifRow), count: Number(countResult?.count ?? 0) };
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const url = `${notificationsUrl}&size=${size}&page=${page}`;
  const { data } = await baserowGet<BaserowList<PushNotificationRecord>>(url);
  return { results: data.results, count: data.count };
}

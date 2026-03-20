import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema/cases";
import { users } from "@/lib/db/schema/users";
import { userDepartments } from "@/lib/db/schema/userDepartments";

// ---------------------------------------------------------------------------
// Throttle: max 1 push per caseId every 30s
// ---------------------------------------------------------------------------

const throttleMap = new Map<number, number>();
const THROTTLE_MS = 30_000;

function isThrottled(caseId: number): boolean {
  const last = throttleMap.get(caseId);
  if (last && Date.now() - last < THROTTLE_MS) return true;
  throttleMap.set(caseId, Date.now());
  // Cleanup old entries periodically
  if (throttleMap.size > 500) {
    const now = Date.now();
    for (const [k, v] of throttleMap) {
      if (now - v > THROTTLE_MS) throttleMap.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Auth: Bearer PUSH_API_KEY or CALENDAR_API_KEY
// ---------------------------------------------------------------------------

const PUSH_API_KEY = process.env.PUSH_API_KEY;
const CALENDAR_API_KEY = process.env.CALENDAR_API_KEY;

function verifyBearer(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!bearer) return false;
  if (PUSH_API_KEY && bearer === PUSH_API_KEY) return true;
  if (CALENDAR_API_KEY && bearer === CALENDAR_API_KEY) return true;
  return false;
}

// ---------------------------------------------------------------------------
// POST /api/v1/push/notify-message
// Body: { caseId, customerName?, messagePreview?, institutionId? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    if (!verifyBearer(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const caseId = Number(body.caseId);
    if (!caseId || Number.isNaN(caseId)) {
      return NextResponse.json({ error: "caseId is required" }, { status: 400 });
    }

    // Throttle
    if (isThrottled(caseId)) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const customerName = body.customerName || "Cliente";
    const messagePreview = body.messagePreview || "";

    // 1. Fetch case to get assigned user and institution
    const [caseRow] = await db
      .select({
        id: cases.id,
        assignedToUserId: cases.assignedToUserId,
        departmentId: cases.departmentId,
        institutionID: cases.institutionID,
        custumerName: cases.custumerName,
      })
      .from(cases)
      .where(and(eq(cases.id, sql`${caseId}`), or(eq(cases.trashed, false), isNull(cases.trashed))))
      .limit(1);

    if (!caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const institutionId = Number(caseRow.institutionID) || Number(body.institutionId);
    if (!institutionId) {
      return NextResponse.json({ error: "Cannot determine institutionId" }, { status: 400 });
    }

    const displayName = customerName !== "Cliente" ? customerName : caseRow.custumerName || "Cliente";

    // Dynamic import to avoid bundling push service when not needed
    const { getSubscriptionsByUser, getSubscriptionsByInstitution, sendPushToSubscriptions } =
      await import("@/services/push");

    const payload = {
      title: `Nova mensagem de ${displayName}`,
      body: messagePreview.slice(0, 200),
      url: `/chat?case=${caseId}`,
      icon: "/icons/icon-192x192.png",
      tag: `new-msg-${caseId}`,
    };

    const assignedUserId = Number(caseRow.assignedToUserId) || 0;

    // 2a. If case has assigned user, notify only that user
    if (assignedUserId) {
      const [user] = await db
        .select({ email: users.email, legacyUserId: users.legacyUserId })
        .from(users)
        .where(eq(users.id, sql`${assignedUserId}`))
        .limit(1);

      if (user) {
        const subs = await getSubscriptionsByUser(
          user.legacyUserId,
          user.email,
          institutionId,
        );
        if (subs.length > 0) {
          const result = await sendPushToSubscriptions(subs, payload);
          return NextResponse.json({ ok: true, sent: result.sent, target: "user" });
        }
      }
    }

    // 2b. If case has department, notify all users in that department
    const departmentId = Number(caseRow.departmentId) || 0;
    if (departmentId) {
      const deptUsers = await db
        .select({ userId: userDepartments.userId })
        .from(userDepartments)
        .where(eq(userDepartments.departmentId, sql`${String(departmentId)}`));

      const allSubs = [];
      for (const du of deptUsers) {
        const uid = Number(du.userId) || 0;
        if (!uid) continue;
        const [user] = await db
          .select({ email: users.email, legacyUserId: users.legacyUserId })
          .from(users)
          .where(eq(users.id, sql`${uid}`))
          .limit(1);
        if (user) {
          const subs = await getSubscriptionsByUser(
            user.legacyUserId,
            user.email,
            institutionId,
          );
          allSubs.push(...subs);
        }
      }

      if (allSubs.length > 0) {
        // Deduplicate by endpoint
        const seen = new Set<string>();
        const uniqueSubs = allSubs.filter((s) => {
          if (seen.has(s.endpoint)) return false;
          seen.add(s.endpoint);
          return true;
        });
        const result = await sendPushToSubscriptions(uniqueSubs, payload);
        return NextResponse.json({ ok: true, sent: result.sent, target: "department" });
      }
    }

    // 2c. Fallback: notify entire institution
    const subs = await getSubscriptionsByInstitution(institutionId);
    if (subs.length > 0) {
      const result = await sendPushToSubscriptions(subs, payload);
      return NextResponse.json({ ok: true, sent: result.sent, target: "institution" });
    }

    return NextResponse.json({ ok: true, sent: 0, target: "none" });
  } catch (err) {
    console.error("[push/notify-message] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

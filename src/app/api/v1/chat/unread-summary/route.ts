import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema/cases";
import { getRequestAuth } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Server-side cache (30s TTL)
// ---------------------------------------------------------------------------

type CacheEntry = {
  data: { id: number; lastMessageAt: string | null }[];
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// GET /api/v1/chat/unread-summary?institutionId=X
// Returns lightweight list: [{ id, lastMessageAt }]
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const institutionId = auth.institutionId;
    const isSysAdmin = institutionId === 4;

    // Check cache
    const cacheKey = `unread_${institutionId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ conversations: cached.data });
    }

    // Query: get all case IDs with their last_message_at (from messages table)
    const lastMsgRows = await db.execute<{ case_id: string; last_msg: string }>(
      sql`SELECT field_1701 as case_id, max(created_on) as last_msg
          FROM database_table_227
          WHERE field_1701 IS NOT NULL
          GROUP BY field_1701`
    );

    const lastMsgMap = new Map<string, string>();
    for (const row of lastMsgRows.rows) {
      if (row.case_id && row.last_msg) {
        lastMsgMap.set(row.case_id, String(row.last_msg));
      }
    }

    // Get case IDs for this institution
    const whereClause = isSysAdmin
      ? undefined
      : eq(cases.institutionID, String(institutionId));

    const caseRows = await db
      .select({ id: cases.id, caseId: cases.caseId })
      .from(cases)
      .where(whereClause)
      .orderBy(desc(cases.id));

    const conversations = caseRows.map((c) => {
      const candidates = [String(c.id)];
      if (c.caseId != null) candidates.push(String(c.caseId));

      let best: string | null = null;
      for (const cand of candidates) {
        const ts = lastMsgMap.get(cand);
        if (ts && (!best || ts > best)) best = ts;
      }

      return { id: c.id, lastMessageAt: best };
    });

    // Cache result
    cache.set(cacheKey, { data: conversations, timestamp: Date.now() });

    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[unread-summary] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

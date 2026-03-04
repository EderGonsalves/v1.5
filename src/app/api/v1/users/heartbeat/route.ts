import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getRequestAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tryDrizzle } from "@/lib/db/repository";

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const institutionId = String(auth.institutionId);
  const legacyUserId = auth.legacyUserId ?? "";
  const email = (
    auth.payload as Record<string, unknown> | undefined
  )?.email as string | undefined;
  const numericId = Number(legacyUserId);

  await tryDrizzle("users", async () => {
    // Match user by legacyUserId OR email OR numeric id, within same institution.
    // Uses subquery because PostgreSQL doesn't support LIMIT in UPDATE directly.
    await db.execute(sql`
      UPDATE database_table_236
      SET last_active_at = NOW()
      WHERE id = (
        SELECT id FROM database_table_236
        WHERE field_1798 = ${institutionId}
          AND field_1801 = true
          AND (
            ${legacyUserId ? sql`field_1797 = ${legacyUserId}` : sql`false`}
            ${email ? sql`OR lower(field_1800) = lower(${email})` : sql``}
            ${Number.isFinite(numericId) && numericId > 0 ? sql`OR id = ${numericId}` : sql``}
          )
        LIMIT 1
      )
    `);
  });

  return NextResponse.json({ ok: true });
}

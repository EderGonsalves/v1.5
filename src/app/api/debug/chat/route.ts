import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { caseMessages } from "@/lib/db/schema/caseMessages";
import { desc, eq, sql } from "drizzle-orm";
import { getRequestAuth } from "@/lib/auth/session";
import { useDirectDb } from "@/lib/db/repository";

/**
 * GET /api/debug/chat?case=4130
 *
 * Endpoint de diagnóstico para verificar mensagens no banco.
 * Requer auth (sysAdmin). Remover após resolver o problema.
 */
export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth || auth.institutionId !== 4) {
    return NextResponse.json({ error: "sysAdmin only" }, { status: 403 });
  }

  const caseId = request.nextUrl.searchParams.get("case");

  try {
    const drizzleEnabled = useDirectDb("chat");

    // Últimas 15 mensagens (por caso ou geral)
    let rows;
    if (caseId) {
      rows = await db
        .select({
          id: caseMessages.id,
          caseId: caseMessages.caseId,
          from: caseMessages.from,
          to: caseMessages.to,
          senderName: caseMessages.senderName,
          message: sql<string>`LEFT(${caseMessages.message}::text, 80)`,
          file: caseMessages.file,
          createdOn: caseMessages.createdOn,
        })
        .from(caseMessages)
        .where(eq(caseMessages.caseId, caseId))
        .orderBy(desc(caseMessages.id))
        .limit(15);
    } else {
      rows = await db
        .select({
          id: caseMessages.id,
          caseId: caseMessages.caseId,
          from: caseMessages.from,
          to: caseMessages.to,
          senderName: caseMessages.senderName,
          message: sql<string>`LEFT(${caseMessages.message}::text, 80)`,
          file: caseMessages.file,
          createdOn: caseMessages.createdOn,
        })
        .from(caseMessages)
        .orderBy(desc(caseMessages.id))
        .limit(15);
    }

    // Max ID geral
    const [maxRow] = await db
      .select({ maxId: sql<number>`MAX(id)` })
      .from(caseMessages);

    return NextResponse.json({
      drizzleEnabled,
      maxIdGlobal: maxRow?.maxId,
      caseFilter: caseId || "(todas)",
      count: rows.length,
      messages: rows,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      drizzleEnabled: useDirectDb("chat"),
    }, { status: 500 });
  }
}

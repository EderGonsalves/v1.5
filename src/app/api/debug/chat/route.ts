import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { caseMessages } from "@/lib/db/schema/caseMessages";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getRequestAuth } from "@/lib/auth/session";
import { useDirectDb } from "@/lib/db/repository";

/**
 * GET /api/debug/chat?case=4130&phone=5511937188154
 *
 * Endpoint de diagnóstico para verificar mensagens no banco.
 * - ?case=X  → busca por CaseId = X
 * - ?phone=Y → busca por from/to contendo Y (ignora CaseId)
 * - ambos    → mostra as duas buscas separadas para diagnóstico
 * Requer auth (sysAdmin). Remover após resolver o problema.
 */
export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth || auth.institutionId !== 4) {
    return NextResponse.json({ error: "sysAdmin only" }, { status: 403 });
  }

  const caseId = request.nextUrl.searchParams.get("case");
  const phone = request.nextUrl.searchParams.get("phone")?.replace(/\D/g, "") || null;

  const selectFields = {
    id: caseMessages.id,
    caseId: caseMessages.caseId,
    caseIdIsNull: sql<boolean>`${caseMessages.caseId} IS NULL`,
    caseIdIsEmpty: sql<boolean>`${caseMessages.caseId} = ''`,
    from: caseMessages.from,
    to: caseMessages.to,
    senderName: caseMessages.senderName,
    message: sql<string>`LEFT(${caseMessages.message}::text, 80)`,
    file: caseMessages.file,
    createdOn: caseMessages.createdOn,
  };

  try {
    const drizzleEnabled = useDirectDb("chat");

    // 1) Busca por CaseId exato
    let byCaseId = null;
    if (caseId) {
      byCaseId = await db
        .select(selectFields)
        .from(caseMessages)
        .where(eq(caseMessages.caseId, caseId))
        .orderBy(desc(caseMessages.id))
        .limit(20);
    }

    // 2) Busca por telefone (from/to) — ignora CaseId
    let byPhone = null;
    if (phone) {
      byPhone = await db
        .select(selectFields)
        .from(caseMessages)
        .where(or(
          eq(caseMessages.from, phone),
          eq(caseMessages.to, phone),
        ))
        .orderBy(desc(caseMessages.id))
        .limit(20);
    }

    // 3) Busca mensagens com CaseId NULL ou vazio que tenham o telefone
    let orphanedByPhone = null;
    if (phone) {
      orphanedByPhone = await db
        .select(selectFields)
        .from(caseMessages)
        .where(and(
          or(isNull(caseMessages.caseId), eq(caseMessages.caseId, "")),
          or(
            eq(caseMessages.from, phone),
            eq(caseMessages.to, phone),
          ),
        ))
        .orderBy(desc(caseMessages.id))
        .limit(20);
    }

    // 4) Mensagens com CaseId NULL/vazio sem from/to (completamente órfãs)
    let fullyOrphaned = null;
    if (caseId) {
      fullyOrphaned = await db
        .select(selectFields)
        .from(caseMessages)
        .where(and(
          or(isNull(caseMessages.caseId), eq(caseMessages.caseId, "")),
          or(
            isNull(caseMessages.from),
            eq(caseMessages.from, ""),
          ),
        ))
        .orderBy(desc(caseMessages.id))
        .limit(10);
    }

    // Max ID geral
    const [maxRow] = await db
      .select({ maxId: sql<number>`MAX(id)` })
      .from(caseMessages);

    return NextResponse.json({
      drizzleEnabled,
      maxIdGlobal: maxRow?.maxId,
      filters: { caseId: caseId || null, phone: phone || null },
      byCaseId: byCaseId ? { count: byCaseId.length, messages: byCaseId } : null,
      byPhone: byPhone ? { count: byPhone.length, messages: byPhone } : null,
      orphanedByPhone: orphanedByPhone ? { count: orphanedByPhone.length, messages: orphanedByPhone } : null,
      fullyOrphaned: fullyOrphaned ? { count: fullyOrphaned.length, messages: fullyOrphaned } : null,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      drizzleEnabled: useDirectDb("chat"),
    }, { status: 500 });
  }
}

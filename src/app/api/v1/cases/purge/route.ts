import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";

const CALENDAR_API_KEY = process.env.CALENDAR_API_KEY;
const SYSADMIN_INSTITUTION_ID = 4;

/** Auth via cookie (browser) OU Bearer API key (N8N / server-to-server) */
const getPurgeAuth = (request: NextRequest) => {
  // 1. Cookie auth
  const cookieAuth = getRequestAuth(request);
  if (cookieAuth) return cookieAuth;

  // 2. Bearer token
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (CALENDAR_API_KEY && bearer && bearer === CALENDAR_API_KEY) {
    return { institutionId: SYSADMIN_INSTITUTION_ID };
  }

  return null;
};
import {
  baserowGet,
  baserowDelete,
  type BaserowCaseRow,
} from "@/services/api";
import { db } from "@/lib/db";
import { cases as casesTable } from "@/lib/db/schema/cases";
import { caseMessages } from "@/lib/db/schema/caseMessages";
import { eq, and, or, inArray } from "drizzle-orm";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ??
  process.env.NEXT_PUBLIC_BASEROW_API_URL ??
  "";

const BASEROW_CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 225;

const BASEROW_CASE_MESSAGES_TABLE_ID =
  Number(
    process.env.BASEROW_CASE_MESSAGES_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID,
  ) || 227;

const BATCH_SIZE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PurgePayload {
  customerPhone: string;
  wabaPhone: string;
}

interface BaserowList<T> {
  count: number;
  next: string | null;
  results: T[];
}

interface MessageRow {
  id: number;
  CaseId?: string;
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizePhone = (value: unknown): string => {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\D/g, "").trim();
};

/** Fetch all cases matching customerPhone + wabaPhone (display_phone_number) */
const fetchMatchingCases = async (
  customerPhone: string,
  wabaPhone: string,
): Promise<BaserowCaseRow[]> => {
  const suffix = customerPhone.length > 8 ? customerPhone.slice(-8) : customerPhone;
  const wabaSuffix = wabaPhone.length > 8 ? wabaPhone.slice(-8) : wabaPhone;

  const rows: BaserowCaseRow[] = [];
  let nextUrl: string | null =
    `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?user_field_names=true&size=200&filter__CustumerPhone__contains=${suffix}`;

  while (nextUrl) {
    const data: BaserowList<BaserowCaseRow> = (
      await baserowGet<BaserowList<BaserowCaseRow>>(nextUrl)
    ).data;
    rows.push(...(data?.results ?? []));
    const rawNext: string | null | undefined = data?.next;
    nextUrl = rawNext && typeof rawNext === "string" ? rawNext : null;
  }

  // Filter: match both customer phone AND waba phone
  return rows.filter((c) => {
    const cPhone = normalizePhone(c.CustumerPhone);
    const dPhone = normalizePhone(c.display_phone_number);
    const normCustomer = normalizePhone(customerPhone);
    const normWaba = normalizePhone(wabaPhone);

    const customerMatch =
      cPhone === normCustomer ||
      cPhone.endsWith(normCustomer) ||
      normCustomer.endsWith(cPhone);

    const wabaMatch =
      dPhone === normWaba ||
      dPhone.endsWith(normWaba) ||
      normWaba.endsWith(dPhone);

    return customerMatch && wabaMatch;
  });
};

/** Fetch all messages for a given caseId via Baserow */
const fetchMessagesByCaseId = async (
  caseId: string,
): Promise<MessageRow[]> => {
  const rows: MessageRow[] = [];
  let nextUrl: string | null =
    `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true&size=200&filter__CaseId__equal=${caseId}`;

  while (nextUrl) {
    const data: BaserowList<MessageRow> = (
      await baserowGet<BaserowList<MessageRow>>(nextUrl)
    ).data;
    rows.push(...(data?.results ?? []));
    const rawNext: string | null | undefined = data?.next;
    nextUrl = rawNext && typeof rawNext === "string" ? rawNext : null;
  }

  return rows;
};

/** Also fetch orphaned messages (no caseId) where from/to match the phone pair */
const fetchOrphanedMessages = async (
  customerPhone: string,
  wabaPhone: string,
): Promise<MessageRow[]> => {
  const suffix = customerPhone.length > 8 ? customerPhone.slice(-8) : customerPhone;

  const rows: MessageRow[] = [];
  let nextUrl: string | null =
    `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true&size=200&filter__from__contains=${suffix}`;

  while (nextUrl) {
    const data: BaserowList<MessageRow> = (
      await baserowGet<BaserowList<MessageRow>>(nextUrl)
    ).data;
    rows.push(...(data?.results ?? []));
    const rawNext: string | null | undefined = data?.next;
    nextUrl = rawNext && typeof rawNext === "string" ? rawNext : null;
  }

  // Also fetch where customer is in "to" field
  let nextUrl2: string | null =
    `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true&size=200&filter__to__contains=${suffix}`;

  while (nextUrl2) {
    const data: BaserowList<MessageRow> = (
      await baserowGet<BaserowList<MessageRow>>(nextUrl2)
    ).data;
    const results = data?.results ?? [];
    // Deduplicate by id
    for (const r of results) {
      if (!rows.some((existing) => existing.id === r.id)) {
        rows.push(r);
      }
    }
    const rawNext: string | null | undefined = data?.next;
    nextUrl2 = rawNext && typeof rawNext === "string" ? rawNext : null;
  }

  const normCustomer = normalizePhone(customerPhone);
  const normWaba = normalizePhone(wabaPhone);

  // Filter: messages where from/to match the customer+waba phone pair
  return rows.filter((msg) => {
    const fromPhone = normalizePhone(msg.from);
    const toPhone = normalizePhone(msg.to);

    const pair1 =
      (fromPhone.endsWith(normCustomer) || normCustomer.endsWith(fromPhone)) &&
      (toPhone.endsWith(normWaba) || normWaba.endsWith(toPhone));

    const pair2 =
      (fromPhone.endsWith(normWaba) || normWaba.endsWith(fromPhone)) &&
      (toPhone.endsWith(normCustomer) || normCustomer.endsWith(toPhone));

    return pair1 || pair2;
  });
};

/** Delete a case row (Drizzle first, Baserow fallback) */
const deleteCaseRow = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle("cases", async () => {
      await db.delete(casesTable).where(eq(casesTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/`;
  await baserowDelete(url);
};

/** Delete a message row (Drizzle first, Baserow fallback) */
const deleteMessageRow = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle("cases", async () => {
      await db.delete(caseMessages).where(eq(caseMessages.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/${rowId}/`;
  await baserowDelete(url);
};

/** Process items in batches */
const batchProcess = async <T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<string[]> => {
  const errors: string[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(fn));
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(String(r.reason));
      }
    }
  }
  return errors;
};

// Force dynamic — never cache this route
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/cases/purge
// ---------------------------------------------------------------------------
//
// Payload:
// {
//   "customerPhone": "+5511999998888",   // telefone do cliente (CustumerPhone)
//   "wabaPhone": "+5511333334444",       // telefone WABA com quem o cliente conversa (display_phone_number)
//   "dryRun": true                       // opcional — se true, não exclui, só lista o que seria excluído
// }
//
// Resposta:
// {
//   "dryRun": false,
//   "casesFound": 2,
//   "casesDeleted": 2,
//   "messagesFound": 45,
//   "messagesDeleted": 45,
//   "errors": []
// }

export async function POST(request: NextRequest) {
  const auth = getPurgeAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json(
      { error: "Acesso restrito a SysAdmin" },
      { status: 403 },
    );
  }

  let body: PurgePayload & { dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { customerPhone, wabaPhone } = body;
  const dryRun = body.dryRun === true || body.dryRun === "true";

  if (!customerPhone || !wabaPhone) {
    return NextResponse.json(
      {
        error: "customerPhone e wabaPhone são obrigatórios",
        example: {
          customerPhone: "+5511999998888",
          wabaPhone: "+5511333334444",
          dryRun: true,
        },
      },
      { status: 400 },
    );
  }

  const normCustomer = normalizePhone(customerPhone);
  const normWaba = normalizePhone(wabaPhone);

  if (normCustomer.length < 8 || normWaba.length < 8) {
    return NextResponse.json(
      { error: "Telefones devem ter ao menos 8 dígitos" },
      { status: 400 },
    );
  }

  try {
    // 1. Find matching cases
    const matchingCases = await fetchMatchingCases(normCustomer, normWaba);

    if (matchingCases.length === 0) {
      return NextResponse.json({
        dryRun,
        casesFound: 0,
        casesDeleted: 0,
        messagesFound: 0,
        messagesDeleted: 0,
        message: "Nenhum caso encontrado para esse par de telefones",
      });
    }

    // 2. Collect all messages (linked by caseId + orphaned by phone pair)
    const allMessageIds = new Set<number>();
    const messageRows: MessageRow[] = [];

    for (const c of matchingCases) {
      const caseId = String(c.CaseId ?? c.id);
      const msgs = await fetchMessagesByCaseId(caseId);
      for (const msg of msgs) {
        if (!allMessageIds.has(msg.id)) {
          allMessageIds.add(msg.id);
          messageRows.push(msg);
        }
      }
    }

    // Also get orphaned messages (no caseId but matching phone pair)
    const orphaned = await fetchOrphanedMessages(normCustomer, normWaba);
    for (const msg of orphaned) {
      if (!allMessageIds.has(msg.id)) {
        allMessageIds.add(msg.id);
        messageRows.push(msg);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        casesFound: matchingCases.length,
        casesDeleted: 0,
        messagesFound: messageRows.length,
        messagesDeleted: 0,
        cases: matchingCases.map((c) => ({
          id: c.id,
          caseId: c.CaseId,
          customerPhone: c.CustumerPhone,
          customerName: c.CustumerName,
          wabaPhone: c.display_phone_number,
          statusCaso: c.status_caso,
        })),
        message: "Dry run — nada foi excluído",
      });
    }

    // 3. Delete messages first (they reference the cases)
    const msgErrors = await batchProcess(
      messageRows,
      BATCH_SIZE,
      async (msg) => {
        await deleteMessageRow(msg.id);
      },
    );

    // 4. Delete cases
    const caseErrors = await batchProcess(
      matchingCases,
      BATCH_SIZE,
      async (c) => {
        await deleteCaseRow(c.id);
      },
    );

    const allErrors = [...msgErrors, ...caseErrors];

    return NextResponse.json({
      dryRun: false,
      casesFound: matchingCases.length,
      casesDeleted: matchingCases.length - caseErrors.length,
      messagesFound: messageRows.length,
      messagesDeleted: messageRows.length - msgErrors.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (err) {
    console.error("[purge] Erro ao purgar casos:", err);
    return NextResponse.json(
      { error: "Erro ao purgar casos e mensagens" },
      { status: 500 },
    );
  }
}

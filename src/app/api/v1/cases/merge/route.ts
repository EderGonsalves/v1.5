import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";
import {
  getBaserowCases,
  updateBaserowCase,
  baserowGet,
  baserowPatch,
  baserowDelete,
  type BaserowCaseRow,
} from "@/services/api";
import { db } from "@/lib/db";
import { cases as casesTable } from "@/lib/db/schema/cases";
import { caseMessages } from "@/lib/db/schema/caseMessages";
import { eq } from "drizzle-orm";
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
// Helpers
// ---------------------------------------------------------------------------

const normalizePhone = (value: unknown): string => {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\D/g, "").trim();
};

type DuplicateGroup = {
  phone: string;
  wabaPhone: string;
  cases: BaserowCaseRow[];
  survivorId: number;
  mergeCandidateIds: number[];
};

const buildGroups = (cases: BaserowCaseRow[]): DuplicateGroup[] => {
  const map = new Map<string, BaserowCaseRow[]>();

  for (const c of cases) {
    const phone = normalizePhone(c.CustumerPhone);
    const waba = normalizePhone(c.display_phone_number);
    if (!phone) continue;

    const key = `${phone}::${waba}`;
    const group = map.get(key);
    if (group) {
      group.push(c);
    } else {
      map.set(key, [c]);
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, caseList] of map.entries()) {
    if (caseList.length < 2) continue;

    // Sort ascending by ID — last item is the survivor (most recent)
    caseList.sort((a, b) => a.id - b.id);
    const survivor = caseList[caseList.length - 1];
    const mergeCandidates = caseList.slice(0, -1);
    const [phone, wabaPhone] = key.split("::");

    groups.push({
      phone,
      wabaPhone,
      cases: caseList,
      survivorId: survivor.id,
      mergeCandidateIds: mergeCandidates.map((c) => c.id),
    });
  }

  return groups;
};

/** Merge field values from older cases into the survivor */
const buildMergePayload = (
  survivor: BaserowCaseRow,
  oldCases: BaserowCaseRow[],
): Partial<BaserowCaseRow> => {
  const payload: Record<string, unknown> = {};

  // Conversa — concatenate all (oldest first, then survivor's at the end)
  const conversas = [
    ...oldCases.map((c) => c.Conversa?.trim()).filter(Boolean),
    survivor.Conversa?.trim(),
  ].filter(Boolean);
  if (conversas.length > 1) {
    payload.Conversa = conversas.join("\n---\n");
  }

  // DepoimentoInicial — keep the first non-empty (oldest has original)
  if (!survivor.DepoimentoInicial) {
    for (const c of oldCases) {
      if (c.DepoimentoInicial?.trim()) {
        payload.DepoimentoInicial = c.DepoimentoInicial;
        break;
      }
    }
  }

  // Resumo — keep survivor's if exists, else take from old cases (most recent old)
  if (!survivor.Resumo) {
    for (let i = oldCases.length - 1; i >= 0; i--) {
      if (oldCases[i].Resumo?.trim()) {
        payload.Resumo = oldCases[i].Resumo;
        break;
      }
    }
  }

  // notas_caso — concatenate
  const notas = [
    ...oldCases.map((c) => {
      const n = c.notas_caso;
      return typeof n === "string" ? n.trim() : "";
    }).filter(Boolean),
    typeof survivor.notas_caso === "string" ? survivor.notas_caso.trim() : "",
  ].filter(Boolean);
  if (notas.length > 1) {
    payload.notas_caso = notas.join("\n---\n");
  }

  // Take-latest-non-null fields
  const latestFields: (keyof BaserowCaseRow)[] = [
    "valor",
    "resultado",
    "cnj_number",
    "lawsuit_summary",
    "lawsuit_tracking_active",
    "BJCaseId",
  ];
  for (const field of latestFields) {
    if (survivor[field] == null || survivor[field] === "") {
      for (let i = oldCases.length - 1; i >= 0; i--) {
        const val = oldCases[i][field];
        if (val != null && val !== "") {
          payload[field] = val;
          break;
        }
      }
    }
  }

  return payload as Partial<BaserowCaseRow>;
};

type MessageRow = {
  id: number;
  CaseId?: string | number | null;
  [key: string]: unknown;
};

type BaserowListResp = {
  count?: number;
  results?: MessageRow[];
  next?: string | null;
};

/** Fetch all messages for a given CaseId */
const fetchMessagesByCaseId = async (
  caseId: string | number,
): Promise<MessageRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle("cases", async () => {
      const rows = await db
        .select({ id: caseMessages.id, caseId: caseMessages.caseId })
        .from(caseMessages)
        .where(eq(caseMessages.caseId, String(caseId)));
      return rows.map((r) => ({ id: r.id, CaseId: r.caseId } as MessageRow));
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const rows: MessageRow[] = [];
  let nextUrl: string | null =
    `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true&size=200&filter__CaseId__equal=${caseId}`;

  while (nextUrl) {
    const data: BaserowListResp = (await baserowGet<BaserowListResp>(nextUrl)).data;
    const results: MessageRow[] = data?.results ?? [];
    rows.push(...results);
    const rawNext: string | null | undefined = data?.next;
    nextUrl = rawNext && typeof rawNext === "string" ? rawNext : null;
  }

  return rows;
};

/** Update a message's CaseId */
const updateMessageCaseId = async (
  messageId: number,
  newCaseId: string,
): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle("cases", async () => {
      await db
        .update(caseMessages)
        .set({ caseId: newCaseId })
        .where(eq(caseMessages.id, messageId));
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/${messageId}/?user_field_names=true`;
  await baserowPatch(url, { CaseId: newCaseId });
};

/** Delete a case row */
const deleteCaseRow = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle("cases", async () => {
      await db.delete(casesTable).where(eq(casesTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/`;
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

// ---------------------------------------------------------------------------
// GET /api/v1/cases/merge — Preview duplicate groups
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito a SysAdmin" }, { status: 403 });
  }

  const targetInstitution = request.nextUrl.searchParams.get("institutionId");
  if (!targetInstitution) {
    return NextResponse.json(
      { error: "Query param institutionId é obrigatório" },
      { status: 400 },
    );
  }

  try {
    const response = await getBaserowCases({
      institutionId: Number(targetInstitution),
      fetchAll: true,
      pageSize: 200,
    });

    const groups = buildGroups(response.results);

    return NextResponse.json({
      totalCases: response.results.length,
      totalDuplicateGroups: groups.length,
      totalDuplicateRows: groups.reduce((sum, g) => sum + g.mergeCandidateIds.length, 0),
      groups: groups.map((g) => ({
        phone: g.phone,
        wabaPhone: g.wabaPhone,
        survivorId: g.survivorId,
        mergeCandidateIds: g.mergeCandidateIds,
        caseIds: g.cases.map((c) => c.id),
        names: g.cases.map((c) => c.CustumerName ?? "—"),
      })),
    });
  } catch (err) {
    console.error("[merge] Erro ao listar duplicados:", err);
    return NextResponse.json(
      { error: "Erro ao buscar casos" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/cases/merge — Execute merge
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito a SysAdmin" }, { status: 403 });
  }

  let body: { institutionId?: number; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const targetInstitution = body.institutionId;
  if (!targetInstitution) {
    return NextResponse.json(
      { error: "institutionId é obrigatório" },
      { status: 400 },
    );
  }

  const dryRun = body.dryRun ?? false;

  try {
    const response = await getBaserowCases({
      institutionId: targetInstitution,
      fetchAll: true,
      pageSize: 200,
    });

    const groups = buildGroups(response.results);

    if (!groups.length) {
      return NextResponse.json({
        message: "Nenhum duplicado encontrado",
        merged: 0,
        deleted: 0,
        messagesMigrated: 0,
      });
    }

    const report: Array<{
      phone: string;
      survivorId: number;
      deletedIds: number[];
      messagesMoved: number;
      errors: string[];
    }> = [];

    let totalDeleted = 0;
    let totalMessagesMigrated = 0;
    const allErrors: string[] = [];

    for (const group of groups) {
      const survivor = group.cases[group.cases.length - 1];
      const oldCases = group.cases.slice(0, -1);
      const groupErrors: string[] = [];
      let groupMessagesMoved = 0;

      // Step 1: Build merge payload
      const mergePayload = buildMergePayload(survivor, oldCases);

      // Step 2: Migrate messages from old cases to survivor
      const survivorCaseId = String(survivor.CaseId ?? survivor.id);

      for (const oldCase of oldCases) {
        const oldCaseId = String(oldCase.CaseId ?? oldCase.id);
        const messages = await fetchMessagesByCaseId(oldCaseId);

        if (messages.length > 0 && !dryRun) {
          const errors = await batchProcess(
            messages,
            BATCH_SIZE,
            async (msg) => {
              await updateMessageCaseId(msg.id, survivorCaseId);
            },
          );
          groupErrors.push(...errors);
        }
        groupMessagesMoved += messages.length;
      }

      // Step 3: Update survivor with merged data
      if (!dryRun && Object.keys(mergePayload).length > 0) {
        try {
          await updateBaserowCase(survivor.id, mergePayload);
        } catch (err) {
          groupErrors.push(`Erro ao atualizar sobrevivente ${survivor.id}: ${err}`);
        }
      }

      // Step 4: Delete old cases
      if (!dryRun) {
        const deleteErrors = await batchProcess(
          oldCases,
          BATCH_SIZE,
          async (c) => {
            await deleteCaseRow(c.id);
          },
        );
        groupErrors.push(...deleteErrors);
      }

      report.push({
        phone: group.phone,
        survivorId: survivor.id,
        deletedIds: group.mergeCandidateIds,
        messagesMoved: groupMessagesMoved,
        errors: groupErrors,
      });

      totalDeleted += oldCases.length;
      totalMessagesMigrated += groupMessagesMoved;
      allErrors.push(...groupErrors);
    }

    return NextResponse.json({
      dryRun,
      merged: groups.length,
      deleted: dryRun ? 0 : totalDeleted,
      messagesMigrated: dryRun ? totalMessagesMigrated : totalMessagesMigrated,
      errors: allErrors,
      report,
    });
  } catch (err) {
    console.error("[merge] Erro ao executar merge:", err);
    return NextResponse.json(
      { error: "Erro ao executar merge de casos" },
      { status: 500 },
    );
  }
}

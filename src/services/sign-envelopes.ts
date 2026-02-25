/**
 * Sign Envelopes Service — CRUD for Baserow table 256
 * Server-only. Supports Drizzle ORM (direct DB) with Baserow REST API fallback.
 * Feature flag domain: "sign"
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { signEnvelopes } from "@/lib/db/schema/signEnvelopes";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { baserowGet, baserowPost, baserowPatch } from "./api";
import type { SignEnvelopeRow } from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const TABLE_ID = process.env.BASEROW_SIGN_ENVELOPES_TABLE_ID ?? "256";

/** Baserow field_id for the status single_select column */
const STATUS_FIELD_ID = 1980;

const tableUrl = () =>
  `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/?user_field_names=true`;

type BaserowListResponse<T> = {
  count: number;
  next: string | null;
  results: T[];
};

// ---------------------------------------------------------------------------
// Drizzle row → SignEnvelopeRow mapper
// ---------------------------------------------------------------------------

/**
 * Resolve a single_select integer ID to its string value via
 * Baserow's internal `database_selectoption` table.
 */
async function resolveSelectOptionValue(
  optionId: number | null,
): Promise<string> {
  if (!optionId) return "";
  const result = await db.execute(
    sql`SELECT value FROM database_selectoption WHERE id = ${optionId} LIMIT 1`,
  );
  const row = result.rows[0] as { value: string } | undefined;
  return row?.value ?? "";
}

/**
 * Resolve a single_select string value to its integer ID for writes.
 */
async function resolveSelectOptionId(
  fieldId: number,
  value: string,
): Promise<number | null> {
  if (!value) return null;
  const result = await db.execute(
    sql`SELECT id FROM database_selectoption WHERE field_id = ${fieldId} AND value = ${value} LIMIT 1`,
  );
  const row = result.rows[0] as { id: number } | undefined;
  return row?.id ?? null;
}

/** Map Drizzle row → SignEnvelopeRow (snake_case fields for API compat) */
function mapRow(
  row: typeof signEnvelopes.$inferSelect,
  statusValue: string,
): SignEnvelopeRow {
  return {
    id: row.id,
    case_id: Number(row.caseId) || 0,
    envelope_id: row.envelopeId || "",
    document_id: row.documentId || "",
    template_id: 0, // not stored in DB — field does not exist in Baserow table
    subject: row.subject || "",
    status: statusValue,
    signer_name: row.signerName || "",
    signer_phone: row.signerPhone || "",
    signer_email: row.signerEmail || "",
    sign_url: row.signUrl || "",
    signers_json: row.signersJson || "",
    signed_at: row.signedAt || "",
    institution_id: Number(row.institutionId) || 0,
    created_by_user_id: Number(row.createdByUserId) || 0,
    created_at: row.createdAt || "",
    updated_at: row.updatedAt || "",
  };
}

/**
 * Map an array of Drizzle rows, resolving their status IDs in batch.
 */
async function mapRows(
  rows: (typeof signEnvelopes.$inferSelect)[],
): Promise<SignEnvelopeRow[]> {
  if (rows.length === 0) return [];

  // Collect unique status IDs
  const statusIds = [...new Set(rows.map((r) => r.status).filter(Boolean))] as number[];

  // Batch resolve
  const statusMap = new Map<number, string>();
  if (statusIds.length > 0) {
    const result = await db.execute(
      sql`SELECT id, value FROM database_selectoption WHERE id IN ${sql.raw(`(${statusIds.join(",")})`)}`,
    );
    for (const opt of result.rows as { id: number; value: string }[]) {
      statusMap.set(opt.id, opt.value);
    }
  }

  return rows.map((row) =>
    mapRow(row, row.status ? (statusMap.get(row.status) ?? "") : ""),
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getEnvelopesByCaseId(
  caseId: number,
  institutionId?: number,
): Promise<SignEnvelopeRow[]> {
  if (useDirectDb("sign")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [eq(signEnvelopes.caseId, String(caseId))];
      if (institutionId && institutionId !== 4) {
        conditions.push(eq(signEnvelopes.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(signEnvelopes)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions));
      return mapRows(rows);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  let url = `${tableUrl()}&filter__case_id__equal=${caseId}`;
  if (institutionId && institutionId !== 4) {
    url += `&filter__institution_id__equal=${institutionId}`;
  }
  const resp =
    await baserowGet<BaserowListResponse<SignEnvelopeRow>>(url);
  return resp.data.results ?? [];
}

export async function getEnvelopeByRiaId(
  envelopeId: string,
): Promise<SignEnvelopeRow | null> {
  if (useDirectDb("sign")) {
    const _dr = await tryDrizzle(async () => {
      const [row] = await db
        .select()
        .from(signEnvelopes)
        .where(eq(signEnvelopes.envelopeId, envelopeId))
        .limit(1);
      if (!row) return null;
      const statusValue = await resolveSelectOptionValue(row.status);
      return mapRow(row, statusValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const url = `${tableUrl()}&filter__envelope_id__equal=${encodeURIComponent(envelopeId)}`;
  const resp =
    await baserowGet<BaserowListResponse<SignEnvelopeRow>>(url);
  return resp.data.results?.[0] ?? null;
}

export async function getEnvelopeById(
  id: number,
): Promise<SignEnvelopeRow | null> {
  if (useDirectDb("sign")) {
    const _dr = await tryDrizzle(async () => {
      const [row] = await db
        .select()
        .from(signEnvelopes)
        .where(eq(signEnvelopes.id, id))
        .limit(1);
      if (!row) return null;
      const statusValue = await resolveSelectOptionValue(row.status);
      return mapRow(row, statusValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
    const resp = await baserowGet<SignEnvelopeRow>(url);
    return resp.data;
  } catch {
    return null;
  }
}

export async function createEnvelopeRecord(
  data: Omit<SignEnvelopeRow, "id">,
): Promise<SignEnvelopeRow> {
  if (useDirectDb("sign")) {
    const _dr = await tryDrizzle(async () => {
      // Resolve status string → integer option ID
      const statusOptionId = await resolveSelectOptionId(
        STATUS_FIELD_ID,
        data.status,
      );
  
      const [created] = await db
        .insert(signEnvelopes)
        .values({
          caseId: String(data.case_id),
          envelopeId: data.envelope_id,
          documentId: data.document_id,
          subject: data.subject,
          status: statusOptionId,
          signerName: data.signer_name,
          signerPhone: data.signer_phone,
          signerEmail: data.signer_email,
          signUrl: data.sign_url,
          signersJson: data.signers_json,
          signedAt: data.signed_at,
          institutionId: String(data.institution_id),
          createdByUserId: String(data.created_by_user_id),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        })
        .returning();
  
      const statusValue = await resolveSelectOptionValue(created.status);
      return mapRow(created, statusValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const resp = await baserowPost<SignEnvelopeRow>(tableUrl(), data);
  return resp.data;
}

export async function updateEnvelopeRecord(
  id: number,
  data: Partial<SignEnvelopeRow>,
): Promise<SignEnvelopeRow> {
  if (useDirectDb("sign")) {
    const _dr = await tryDrizzle(async () => {
      // Build the set object, mapping snake_case → camelCase
      const setObj: Partial<typeof signEnvelopes.$inferInsert> = {};
  
      if (data.case_id !== undefined) setObj.caseId = String(data.case_id);
      if (data.envelope_id !== undefined) setObj.envelopeId = data.envelope_id;
      if (data.document_id !== undefined) setObj.documentId = data.document_id;
      if (data.subject !== undefined) setObj.subject = data.subject;
      if (data.signer_name !== undefined) setObj.signerName = data.signer_name;
      if (data.signer_phone !== undefined) setObj.signerPhone = data.signer_phone;
      if (data.signer_email !== undefined) setObj.signerEmail = data.signer_email;
      if (data.sign_url !== undefined) setObj.signUrl = data.sign_url;
      if (data.signers_json !== undefined) setObj.signersJson = data.signers_json;
      if (data.signed_at !== undefined) setObj.signedAt = data.signed_at;
      if (data.institution_id !== undefined)
        setObj.institutionId = String(data.institution_id);
      if (data.created_by_user_id !== undefined)
        setObj.createdByUserId = String(data.created_by_user_id);
      if (data.created_at !== undefined) setObj.createdAt = data.created_at;
  
      // Always update updated_at
      setObj.updatedAt = new Date().toISOString();
  
      // Handle status single_select: resolve string → option ID
      if (data.status !== undefined) {
        const statusOptionId = await resolveSelectOptionId(
          STATUS_FIELD_ID,
          data.status,
        );
        setObj.status = statusOptionId;
      }
  
      const [updated] = await db
        .update(signEnvelopes)
        .set(setObj)
        .where(eq(signEnvelopes.id, id))
        .returning();
  
      const statusValue = await resolveSelectOptionValue(updated.status);
      return mapRow(updated, statusValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
  const resp = await baserowPatch<SignEnvelopeRow>(url, {
    ...data,
    updated_at: new Date().toISOString(),
  });
  return resp.data;
}

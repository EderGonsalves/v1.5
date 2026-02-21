/**
 * Sign Envelopes Service — CRUD for Baserow table 256
 * Server-only. Pattern: follows src/services/lawsuit.ts
 */

import { baserowGet, baserowPost, baserowPatch } from "./api";
import type { SignEnvelopeRow } from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const TABLE_ID = process.env.BASEROW_SIGN_ENVELOPES_TABLE_ID ?? "256";

const tableUrl = () =>
  `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/?user_field_names=true`;

type BaserowListResponse<T> = {
  count: number;
  next: string | null;
  results: T[];
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getEnvelopesByCaseId(
  caseId: number,
  institutionId?: number,
): Promise<SignEnvelopeRow[]> {
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
  const url = `${tableUrl()}&filter__envelope_id__equal=${encodeURIComponent(envelopeId)}`;
  const resp =
    await baserowGet<BaserowListResponse<SignEnvelopeRow>>(url);
  return resp.data.results?.[0] ?? null;
}

export async function getEnvelopeById(
  id: number,
): Promise<SignEnvelopeRow | null> {
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
  const resp = await baserowPost<SignEnvelopeRow>(tableUrl(), data);
  return resp.data;
}

export async function updateEnvelopeRecord(
  id: number,
  data: Partial<SignEnvelopeRow>,
): Promise<SignEnvelopeRow> {
  const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
  const resp = await baserowPatch<SignEnvelopeRow>(url, {
    ...data,
    updated_at: new Date().toISOString(),
  });
  return resp.data;
}

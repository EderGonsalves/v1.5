/**
 * Lawsuit Tracking Service — CRUD Baserow tables 252 (tracking) / 253 (movements)
 * Server-only
 */

import { baserowGet, baserowPost, baserowPatch } from "./api";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const TRACKING_TABLE_ID = process.env.BASEROW_LAWSUIT_TRACKING_TABLE_ID ?? "252";
const MOVEMENTS_TABLE_ID = process.env.BASEROW_LAWSUIT_MOVEMENTS_TABLE_ID ?? "253";

const trackingUrl = () =>
  `${BASEROW_API_URL}/database/rows/table/${TRACKING_TABLE_ID}/?user_field_names=true`;
const movementsUrl = () =>
  `${BASEROW_API_URL}/database/rows/table/${MOVEMENTS_TABLE_ID}/?user_field_names=true`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LawsuitTracking = {
  id: number;
  case_id: number;
  institution_id: number;
  cnj: string;
  is_active: string;
  codilo_process_id: string;
  status: string; // pending | monitoring | error | stopped
  error_message: string;
  movements_count: number;
  last_update_at: string;
  created_at: string;
  updated_at: string;
};

export type LawsuitMovement = {
  id: number;
  tracking_id: number;
  case_id: number;
  institution_id: number;
  movement_date: string;
  movement_type: string; // movimentacao | capa | documento
  title: string;
  content: string;
  source_court: string;
  raw_payload: string;
  created_at: string;
};

type BaserowListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// ---------------------------------------------------------------------------
// Tracking CRUD
// ---------------------------------------------------------------------------

/** List tracking records for a case */
export async function getTrackingByCaseId(
  caseId: number,
  institutionId?: number,
): Promise<LawsuitTracking[]> {
  let url = `${trackingUrl()}&filter__case_id__equal=${caseId}`;
  if (institutionId && institutionId !== 4) {
    url += `&filter__institution_id__equal=${institutionId}`;
  }

  const resp = await baserowGet<BaserowListResponse<LawsuitTracking>>(url);
  return resp.data.results ?? [];
}

/** Get single tracking by ID */
export async function getTrackingById(
  trackingId: number,
): Promise<LawsuitTracking | null> {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${TRACKING_TABLE_ID}/${trackingId}/?user_field_names=true`;
    const resp = await baserowGet<LawsuitTracking>(url);
    return resp.data;
  } catch {
    return null;
  }
}

/** Create new tracking */
export async function createTracking(
  data: Omit<LawsuitTracking, "id">,
): Promise<LawsuitTracking> {
  const resp = await baserowPost<LawsuitTracking>(trackingUrl(), data);
  return resp.data;
}

/** Update tracking */
export async function updateTracking(
  trackingId: number,
  data: Partial<LawsuitTracking>,
): Promise<LawsuitTracking> {
  const url = `${BASEROW_API_URL}/database/rows/table/${TRACKING_TABLE_ID}/${trackingId}/?user_field_names=true`;
  const resp = await baserowPatch<LawsuitTracking>(url, data);
  return resp.data;
}

// ---------------------------------------------------------------------------
// Movements CRUD
// ---------------------------------------------------------------------------

/** List movements for a tracking (paginated, newest first) */
export async function getMovementsByTrackingId(
  trackingId: number,
  opts?: { page?: number; size?: number },
): Promise<{ results: LawsuitMovement[]; count: number }> {
  const page = opts?.page ?? 1;
  const size = opts?.size ?? 25;
  const url = `${movementsUrl()}&filter__tracking_id__equal=${trackingId}&size=${size}&page=${page}`;

  const resp = await baserowGet<BaserowListResponse<LawsuitMovement>>(url);
  return {
    results: resp.data.results ?? [],
    count: resp.data.count ?? 0,
  };
}

/** List movements for a case */
export async function getMovementsByCaseId(
  caseId: number,
  opts?: { page?: number; size?: number },
): Promise<{ results: LawsuitMovement[]; count: number }> {
  const page = opts?.page ?? 1;
  const size = opts?.size ?? 25;
  const url = `${movementsUrl()}&filter__case_id__equal=${caseId}&size=${size}&page=${page}`;

  const resp = await baserowGet<BaserowListResponse<LawsuitMovement>>(url);
  return {
    results: resp.data.results ?? [],
    count: resp.data.count ?? 0,
  };
}

/** Create movement */
export async function createMovement(
  data: Omit<LawsuitMovement, "id">,
): Promise<LawsuitMovement> {
  const resp = await baserowPost<LawsuitMovement>(movementsUrl(), data);
  return resp.data;
}

/** Batch create movements */
export async function createMovements(
  items: Omit<LawsuitMovement, "id">[],
): Promise<LawsuitMovement[]> {
  const results: LawsuitMovement[] = [];
  for (const item of items) {
    const created = await createMovement(item);
    results.push(created);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Summary helper — builds lawsuit_summary for the AI agent
// ---------------------------------------------------------------------------

export function buildLawsuitSummary(
  tracking: LawsuitTracking,
  movements: LawsuitMovement[],
): string {
  const lines: string[] = [];
  lines.push(`Processo CNJ: ${tracking.cnj}`);
  lines.push(`Status monitoramento: ${tracking.status}`);
  lines.push(`Total movimentações: ${tracking.movements_count}`);

  if (movements.length > 0) {
    lines.push("");
    lines.push("Últimas movimentações:");
    // Show last 5
    const recent = movements.slice(0, 5);
    for (const m of recent) {
      const date = m.movement_date || "sem data";
      lines.push(`- [${date}] ${m.title}${m.source_court ? ` (${m.source_court})` : ""}`);
      if (m.content) {
        // Truncate content for summary
        const truncated = m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content;
        lines.push(`  ${truncated}`);
      }
    }
  }

  return lines.join("\n");
}

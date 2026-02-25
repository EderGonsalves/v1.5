/**
 * Lawsuit Tracking Service — CRUD Baserow tables 252 (tracking) / 253 (movements)
 * Server-only — with Drizzle ORM direct DB access and Baserow API fallback
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lawsuitTracking } from "@/lib/db/schema/lawsuitTracking";
import { lawsuitMovements } from "@/lib/db/schema/lawsuitMovements";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
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
// Drizzle row mappers
// ---------------------------------------------------------------------------

/** Map Drizzle row → LawsuitTracking (snake_case fields for API compat) */
function mapTrackingRow(row: typeof lawsuitTracking.$inferSelect): LawsuitTracking {
  return {
    id: row.id,
    case_id: Number(row.caseId) || 0,
    institution_id: Number(row.institutionId) || 0,
    cnj: row.cnj || "",
    is_active: row.isActive || "",
    codilo_process_id: row.codiloProcessId || "",
    status: row.status || "",
    error_message: row.errorMessage || "",
    movements_count: Number(row.movementsCount) || 0,
    last_update_at: row.lastUpdateAt || "",
    created_at: row.createdAt || "",
    updated_at: row.updatedAt || "",
  };
}

/** Map Drizzle row → LawsuitMovement (snake_case fields for API compat) */
function mapMovementRow(row: typeof lawsuitMovements.$inferSelect): LawsuitMovement {
  return {
    id: row.id,
    tracking_id: Number(row.trackingId) || 0,
    case_id: Number(row.caseId) || 0,
    institution_id: Number(row.institutionId) || 0,
    movement_date: row.movementDate || "",
    movement_type: row.movementType || "",
    title: row.title || "",
    content: row.content || "",
    source_court: row.sourceCourt || "",
    raw_payload: row.rawPayload || "",
    created_at: row.createdAt || "",
  };
}

// ---------------------------------------------------------------------------
// Tracking CRUD
// ---------------------------------------------------------------------------

/** List tracking records for a case */
export async function getTrackingByCaseId(
  caseId: number,
  institutionId?: number,
): Promise<LawsuitTracking[]> {
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [eq(lawsuitTracking.caseId, String(caseId))];
      if (institutionId && institutionId !== 4) {
        conditions.push(eq(lawsuitTracking.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(lawsuitTracking)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions));
      return rows.map(mapTrackingRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const [row] = await db
        .select()
        .from(lawsuitTracking)
        .where(eq(lawsuitTracking.id, trackingId))
        .limit(1);
      return row ? mapTrackingRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(lawsuitTracking)
        .values({
          caseId: String(data.case_id),
          institutionId: String(data.institution_id),
          cnj: data.cnj,
          isActive: data.is_active,
          codiloProcessId: data.codilo_process_id,
          status: data.status,
          errorMessage: data.error_message,
          movementsCount: String(data.movements_count),
          lastUpdateAt: data.last_update_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        })
        .returning();
      return mapTrackingRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const resp = await baserowPost<LawsuitTracking>(trackingUrl(), data);
  return resp.data;
}

/** Update tracking */
export async function updateTracking(
  trackingId: number,
  data: Partial<LawsuitTracking>,
): Promise<LawsuitTracking> {
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const setValues: Record<string, unknown> = {};
      if (data.case_id !== undefined) setValues.caseId = String(data.case_id);
      if (data.institution_id !== undefined) setValues.institutionId = String(data.institution_id);
      if (data.cnj !== undefined) setValues.cnj = data.cnj;
      if (data.is_active !== undefined) setValues.isActive = data.is_active;
      if (data.codilo_process_id !== undefined) setValues.codiloProcessId = data.codilo_process_id;
      if (data.status !== undefined) setValues.status = data.status;
      if (data.error_message !== undefined) setValues.errorMessage = data.error_message;
      if (data.movements_count !== undefined) setValues.movementsCount = String(data.movements_count);
      if (data.last_update_at !== undefined) setValues.lastUpdateAt = data.last_update_at;
      if (data.created_at !== undefined) setValues.createdAt = data.created_at;
      if (data.updated_at !== undefined) setValues.updatedAt = data.updated_at;
  
      const [updated] = await db
        .update(lawsuitTracking)
        .set(setValues)
        .where(eq(lawsuitTracking.id, trackingId))
        .returning();
      return mapTrackingRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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

  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(lawsuitMovements)
        .where(eq(lawsuitMovements.trackingId, String(trackingId)));
      const rows = await db
        .select()
        .from(lawsuitMovements)
        .where(eq(lawsuitMovements.trackingId, String(trackingId)))
        .orderBy(desc(lawsuitMovements.id))
        .limit(size)
        .offset((page - 1) * size);
      return {
        results: rows.map(mapMovementRow),
        count: Number(countResult?.count ?? 0),
      };
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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

  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(lawsuitMovements)
        .where(eq(lawsuitMovements.caseId, String(caseId)));
      const rows = await db
        .select()
        .from(lawsuitMovements)
        .where(eq(lawsuitMovements.caseId, String(caseId)))
        .orderBy(desc(lawsuitMovements.id))
        .limit(size)
        .offset((page - 1) * size);
      return {
        results: rows.map(mapMovementRow),
        count: Number(countResult?.count ?? 0),
      };
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(lawsuitMovements)
        .values({
          trackingId: String(data.tracking_id),
          caseId: String(data.case_id),
          institutionId: String(data.institution_id),
          movementDate: data.movement_date,
          movementType: data.movement_type,
          title: data.title,
          content: data.content,
          sourceCourt: data.source_court,
          rawPayload: data.raw_payload,
          createdAt: data.created_at,
        })
        .returning();
      return mapMovementRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const resp = await baserowPost<LawsuitMovement>(movementsUrl(), data);
  return resp.data;
}

/** Batch create movements */
export async function createMovements(
  items: Omit<LawsuitMovement, "id">[],
): Promise<LawsuitMovement[]> {
  if (useDirectDb("lawsuit")) {
    const _dr = await tryDrizzle(async () => {
      if (items.length === 0) return [];
      const rows = await db
        .insert(lawsuitMovements)
        .values(
          items.map((data) => ({
            trackingId: String(data.tracking_id),
            caseId: String(data.case_id),
            institutionId: String(data.institution_id),
            movementDate: data.movement_date,
            movementType: data.movement_type,
            title: data.title,
            content: data.content,
            sourceCourt: data.source_court,
            rawPayload: data.raw_payload,
            createdAt: data.created_at,
          })),
        )
        .returning();
      return rows.map(mapMovementRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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

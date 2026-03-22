import { baserowGet, baserowPatch } from "@/services/api";

export type QueueMode = "round_robin" | "manual" | "round_robin_agenda";

// queue_mode is a multiple_select field (field_1975) on Config table (224).
// Drizzle schema doesn't include this field (multiple_select lives in a junction
// table), so we always fetch directly via Baserow REST API to guarantee the
// field is present in the response.

const BASEROW_API_URL = process.env.BASEROW_API_URL || process.env.NEXT_PUBLIC_BASEROW_API_URL;
const CONFIG_TABLE_ID = 224;

/**
 * Parse queue_mode from a Baserow row's raw value.
 * Handles multiple_select format: [{ id, value, color }] or plain string.
 */
function parseQueueMode(raw: unknown): QueueMode {
  const modeValue =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && raw.length > 0
        ? (raw[0] as { value?: string }).value
        : raw && typeof raw === "object" && "value" in raw
          ? (raw as { value?: string }).value
          : undefined;

  if (modeValue === "round_robin") return "round_robin";
  if (modeValue === "round_robin_agenda") return "round_robin_agenda";
  return "manual";
}

type BaserowListResponse = { results: Array<Record<string, unknown>> };

/**
 * Fetch config rows for an institution, always via Baserow REST API.
 * Returns rows with queue_mode field intact (Drizzle schema doesn't include it).
 */
async function fetchConfigRows(institutionId: number): Promise<Array<Record<string, unknown>>> {
  const filterParam = institutionId !== 4
    ? `&filter__field_1607__equal=${institutionId}`
    : "";
  const url = `${BASEROW_API_URL}/database/rows/table/${CONFIG_TABLE_ID}/?user_field_names=true${filterParam}`;

  const { data } = await baserowGet<BaserowListResponse>(url);
  return data.results ?? [];
}

/**
 * Pick the latest row (highest id) from a list of config rows.
 */
function latestRow(rows: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  if (!rows.length) return undefined;
  return rows.reduce((best, r) =>
    (r.id as number) > (best.id as number) ? r : best, rows[0]);
}

/**
 * Fetch the queue_mode for a given institution from Config table (224).
 * Always uses Baserow REST API (bypasses Drizzle) to guarantee queue_mode
 * field is present in the response.
 * Returns "manual" as default if not set.
 */
export async function getQueueMode(institutionId: number): Promise<QueueMode> {
  const rows = await fetchConfigRows(institutionId);
  const row = latestRow(rows);
  if (!row) return "manual";

  return parseQueueMode(row["queue_mode"]);
}

/**
 * Update the queue_mode for a config row.
 * Uses Baserow REST API directly with the correct multiple_select format.
 */
export async function updateQueueModeServer(rowId: number, mode: QueueMode): Promise<void> {
  const url = `${BASEROW_API_URL}/database/rows/table/${CONFIG_TABLE_ID}/${rowId}/?user_field_names=true`;
  // multiple_select fields expect an array of option values (strings) when using user_field_names
  await baserowPatch(url, { queue_mode: [mode] });
}

/**
 * Returns the latest config row ID for a given institution.
 * Always uses Baserow REST API to stay consistent with getQueueMode.
 */
export async function getLatestConfigRowId(institutionId: number): Promise<number | null> {
  const rows = await fetchConfigRows(institutionId);
  const row = latestRow(rows);
  return (row?.id as number) ?? null;
}

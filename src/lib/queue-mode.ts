import { getBaserowConfigs } from "@/services/api";
import { baserowPatch } from "@/services/api";

export type QueueMode = "round_robin" | "manual" | "round_robin_agenda";

// queue_mode is a multiple_select field (field_1975) on Config table (224).
// Baserow's junction table for this field is unreliable across environments,
// so we always use the Baserow REST API for queue_mode operations.

const BASEROW_API_URL = process.env.BASEROW_API_URL || process.env.NEXT_PUBLIC_BASEROW_API_URL;
const CONFIG_TABLE_ID = 224;

/**
 * Parse queue_mode from a Baserow config row.
 * Handles both plain string and Baserow multiple_select format:
 *   [{ id, value, color }] or { id, value, color } or "string"
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

/**
 * Fetch the queue_mode for a given institution from Config table (224).
 * Returns "manual" as default if not set.
 * Server-side only.
 */
export async function getQueueMode(institutionId: number): Promise<QueueMode> {
  const configs = await getBaserowConfigs(institutionId);
  if (!configs.length) return "manual";

  const latestRow = configs.reduce(
    (current, candidate) => (candidate.id > current.id ? candidate : current),
    configs[0],
  );

  return parseQueueMode((latestRow as Record<string, unknown>)["queue_mode"]);
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
 * Useful for PATCH operations.
 */
export async function getLatestConfigRowId(institutionId: number): Promise<number | null> {
  const configs = await getBaserowConfigs(institutionId);
  if (!configs.length) return null;

  const latestRow = configs.reduce(
    (current, candidate) => (candidate.id > current.id ? candidate : current),
    configs[0],
  );

  return latestRow.id;
}

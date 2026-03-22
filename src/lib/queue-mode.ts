import { sql } from "drizzle-orm";
import { getBaserowConfigs } from "@/services/api";
import { db } from "@/lib/db";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";

export type QueueMode = "round_robin" | "manual" | "round_robin_agenda";

// queue_mode is a multiple_select field (field_1975) on Config table (224).
// In Baserow PG, multiple_select values live in a junction table, NOT as a
// column on the main table.  When Drizzle direct-DB is active we must query
// that junction table explicitly.
const QUEUE_MODE_FIELD_ID = 1975;

/**
 * Read the queue_mode for a given institution's latest config row via raw SQL
 * on Baserow's internal junction + selectoption tables.
 */
async function getQueueModeDrizzle(institutionId: number): Promise<QueueMode | undefined> {
  const result = await db.execute(sql`
    SELECT so.value
    FROM database_table_224 c
    JOIN database_table_224_field_1975 jt ON jt.database_table_224_id = c.id
    JOIN database_selectoption so ON so.id = jt.selectoption_id
    WHERE c.field_1607 = ${String(institutionId)}
    ORDER BY c.id DESC
    LIMIT 1
  `);
  const row = result.rows[0] as { value: string } | undefined;
  if (!row) return undefined;
  if (row.value === "round_robin") return "round_robin";
  if (row.value === "round_robin_agenda") return "round_robin_agenda";
  if (row.value === "manual") return "manual";
  return undefined;
}

/**
 * Fetch the queue_mode for a given institution from Config table (224).
 * Returns "manual" as default if not set.
 * Server-side only.
 */
export async function getQueueMode(institutionId: number): Promise<QueueMode> {
  // Try Drizzle first (handles multiple_select junction table)
  if (useDirectDb("api")) {
    const dr = await tryDrizzle("api", () => getQueueModeDrizzle(institutionId));
    if (dr !== undefined) return dr;
    // tryDrizzle returned undefined → either Drizzle failed or no row found
    // Fall through to Baserow API
  }

  // Baserow API path
  const configs = await getBaserowConfigs(institutionId);
  if (!configs.length) return "manual";

  const latestRow = configs.reduce(
    (current, candidate) => (candidate.id > current.id ? candidate : current),
    configs[0],
  );

  const rawMode = (latestRow as Record<string, unknown>)["queue_mode"];
  // Handle both plain string and Baserow select field format
  // Select fields return: [{ id, value, color }] or { id, value, color }
  const modeValue =
    typeof rawMode === "string"
      ? rawMode
      : Array.isArray(rawMode) && rawMode.length > 0
        ? (rawMode[0] as { value?: string }).value
        : rawMode && typeof rawMode === "object" && "value" in rawMode
          ? (rawMode as { value?: string }).value
          : undefined;

  if (modeValue === "round_robin") return "round_robin";
  if (modeValue === "round_robin_agenda") return "round_robin_agenda";
  return "manual";
}

/**
 * Update the queue_mode for a config row via raw SQL on the junction table.
 */
async function setQueueModeDrizzle(rowId: number, mode: QueueMode): Promise<boolean> {
  // Resolve the selectoption ID for the desired mode value
  const optResult = await db.execute(
    sql`SELECT id FROM database_selectoption WHERE field_id = ${QUEUE_MODE_FIELD_ID} AND value = ${mode} LIMIT 1`,
  );
  const opt = optResult.rows[0] as { id: number } | undefined;
  if (!opt) throw new Error(`Select option not found for queue_mode="${mode}"`);

  // Remove existing selections for this row
  await db.execute(
    sql`DELETE FROM database_table_224_field_1975 WHERE database_table_224_id = ${rowId}`,
  );

  // Insert new selection
  await db.execute(
    sql`INSERT INTO database_table_224_field_1975 (database_table_224_id, selectoption_id) VALUES (${rowId}, ${opt.id})`,
  );

  return true;
}

/**
 * Update the queue_mode for a config row.
 * Handles Drizzle (junction table) and Baserow API paths.
 */
export async function updateQueueModeServer(rowId: number, mode: QueueMode): Promise<void> {
  if (useDirectDb("api")) {
    const dr = await tryDrizzle("api", () => setQueueModeDrizzle(rowId, mode));
    if (dr !== undefined) return;
  }

  // Baserow API fallback
  const { updateBaserowConfig } = await import("@/services/api");
  await updateBaserowConfig(rowId, { queue_mode: mode } as Record<string, unknown>);
}

/**
 * Returns the latest config row ID for a given institution.
 * Useful for PATCH operations.
 */
export async function getLatestConfigRowId(institutionId: number): Promise<number | null> {
  if (useDirectDb("api")) {
    const dr = await tryDrizzle("api", async () => {
      const result = await db.execute(sql`
        SELECT id FROM database_table_224
        WHERE field_1607 = ${String(institutionId)}
        ORDER BY id DESC
        LIMIT 1
      `);
      const row = result.rows[0] as { id: number } | undefined;
      return row?.id ?? null;
    });
    if (dr !== undefined) return dr;
  }

  const configs = await getBaserowConfigs(institutionId);
  if (!configs.length) return null;

  const latestRow = configs.reduce(
    (current, candidate) => (candidate.id > current.id ? candidate : current),
    configs[0],
  );

  return latestRow.id;
}

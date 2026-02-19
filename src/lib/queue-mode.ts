import { getBaserowConfigs } from "@/services/api";

export type QueueMode = "round_robin" | "manual";

/**
 * Fetch the queue_mode for a given institution from Config table (224).
 * Returns "round_robin" as default if not set.
 * Server-side only (uses Baserow API key directly).
 */
export async function getQueueMode(institutionId: number): Promise<QueueMode> {
  const configs = await getBaserowConfigs(institutionId);
  if (!configs.length) return "round_robin";

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

  if (modeValue === "manual") return "manual";
  return "round_robin";
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

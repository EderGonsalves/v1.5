import axios from "axios";

import type { UserPublicRow } from "@/services/permissions";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const DEFAULT_TABLE_ID = 251;
const TABLE_ID =
  Number(
    process.env.BASEROW_ASSIGNMENT_QUEUE_TABLE_ID ?? DEFAULT_TABLE_ID,
  ) || DEFAULT_TABLE_ID;

const ensureEnv = () => {
  if (!BASEROW_API_URL || !BASEROW_API_KEY) {
    throw new Error("Baserow env vars not configured");
  }
};

const client = () => {
  ensureEnv();
  return axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueRecord = {
  id: number;
  user_id: number | string;
  institution_id: number | string;
  last_assigned_at: string;
  assignment_count: number | string;
};

export type QueueStats = {
  position: number;
  totalAssigned: number;
  lastAssignedAt: string | null;
  totalEligible: number;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const fetchQueueRecords = async (
  institutionId: number,
): Promise<QueueRecord[]> => {
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
    filter__institution_id__equal: String(institutionId),
  });
  const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
  const response = await client().get<{ results?: QueueRecord[] }>(url);
  return response.data.results ?? [];
};

export const recordAssignment = async (
  userId: number,
  institutionId: number,
): Promise<void> => {
  const now = new Date().toISOString();

  // Check if record exists
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "1",
    filter__user_id__equal: String(userId),
    filter__institution_id__equal: String(institutionId),
  });
  const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
  const response = await client().get<{ results?: QueueRecord[] }>(url);
  const existing = (response.data.results ?? [])[0];

  if (existing) {
    // Update
    const count = Number(existing.assignment_count) || 0;
    await client().patch(
      `/database/rows/table/${TABLE_ID}/${existing.id}/?user_field_names=true`,
      {
        last_assigned_at: now,
        assignment_count: count + 1,
      },
    );
  } else {
    // Create
    await client().post(
      `/database/rows/table/${TABLE_ID}/?user_field_names=true`,
      {
        user_id: userId,
        institution_id: institutionId,
        last_assigned_at: now,
        assignment_count: 1,
      },
    );
  }
};

// ---------------------------------------------------------------------------
// Round-Robin Selection
// ---------------------------------------------------------------------------

/**
 * Pick the next user to assign a case to, based on round-robin logic.
 * Priority:
 *   1. last_assigned_at ASC (null first = never assigned)
 *   2. assignment_count ASC (tie-breaker)
 *   3. user.id ASC (final tie-breaker)
 *
 * The queueRecords array is mutated in-place after selection so that
 * consecutive calls within the same batch produce different picks.
 */
export const pickNextUser = (
  eligibleUsers: UserPublicRow[],
  queueRecords: QueueRecord[],
): UserPublicRow => {
  if (eligibleUsers.length === 1) return eligibleUsers[0];

  const queueMap = new Map<number, QueueRecord>();
  for (const rec of queueRecords) {
    queueMap.set(Number(rec.user_id), rec);
  }

  const sorted = [...eligibleUsers].sort((a, b) => {
    const recA = queueMap.get(a.id);
    const recB = queueMap.get(b.id);

    const tsA = recA?.last_assigned_at || "";
    const tsB = recB?.last_assigned_at || "";

    // Null/empty timestamps first (never assigned)
    if (!tsA && tsB) return -1;
    if (tsA && !tsB) return 1;
    if (tsA && tsB) {
      const cmp = tsA.localeCompare(tsB);
      if (cmp !== 0) return cmp;
    }

    // Tie-break by assignment_count
    const countA = Number(recA?.assignment_count) || 0;
    const countB = Number(recB?.assignment_count) || 0;
    if (countA !== countB) return countA - countB;

    // Final tie-break by user id
    return a.id - b.id;
  });

  const picked = sorted[0];

  // Mutate queueRecords in-place so next call in the same batch picks someone else
  const existingRec = queueMap.get(picked.id);
  if (existingRec) {
    existingRec.last_assigned_at = new Date().toISOString();
    existingRec.assignment_count =
      (Number(existingRec.assignment_count) || 0) + 1;
  } else {
    queueRecords.push({
      id: 0,
      user_id: picked.id,
      institution_id: 0,
      last_assigned_at: new Date().toISOString(),
      assignment_count: 1,
    });
  }

  return picked;
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const fetchUserQueueStats = async (
  userId: number,
  institutionId: number,
  eligibleUserIds: number[],
): Promise<QueueStats> => {
  const records = await fetchQueueRecords(institutionId);

  const queueMap = new Map<number, QueueRecord>();
  for (const rec of records) {
    queueMap.set(Number(rec.user_id), rec);
  }

  // Sort eligible users by round-robin order to determine position
  const sorted = [...eligibleUserIds].sort((aId, bId) => {
    const recA = queueMap.get(aId);
    const recB = queueMap.get(bId);

    const tsA = recA?.last_assigned_at || "";
    const tsB = recB?.last_assigned_at || "";

    if (!tsA && tsB) return -1;
    if (tsA && !tsB) return 1;
    if (tsA && tsB) {
      const cmp = tsA.localeCompare(tsB);
      if (cmp !== 0) return cmp;
    }

    const countA = Number(recA?.assignment_count) || 0;
    const countB = Number(recB?.assignment_count) || 0;
    if (countA !== countB) return countA - countB;

    return aId - bId;
  });

  const position = sorted.indexOf(userId) + 1; // 1-based
  const userRec = queueMap.get(userId);

  return {
    position: position || eligibleUserIds.length,
    totalAssigned: Number(userRec?.assignment_count) || 0,
    lastAssignedAt: userRec?.last_assigned_at || null,
    totalEligible: eligibleUserIds.length,
  };
};

import axios from "axios";
import { eq, and, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { prepared } from "@/lib/db/prepared";
import { assignmentQueue } from "@/lib/db/schema/assignmentQueue";
import { cases } from "@/lib/db/schema/cases";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
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

const CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 225;

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
// Drizzle row mapper
// ---------------------------------------------------------------------------

/** Map Drizzle row → QueueRecord (snake_case fields for API compat) */
function mapQueueRow(
  row: typeof assignmentQueue.$inferSelect,
): QueueRecord {
  return {
    id: row.id,
    user_id: Number(row.userId) || 0,
    institution_id: Number(row.institutionId) || 0,
    last_assigned_at: row.lastAssignedAt || "",
    assignment_count: Number(row.assignmentCount) || 0,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const fetchQueueRecords = async (
  institutionId: number,
): Promise<QueueRecord[]> => {
  if (useDirectDb("assignment")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await prepared.getQueueByInstitution.execute({
        institutionId: String(institutionId),
      });
      return rows.map(mapQueueRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
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

  if (useDirectDb("assignment")) {
    const _ok = await tryDrizzle(async () => {
      // Check if record exists
      const [existing] = await db
        .select()
        .from(assignmentQueue)
        .where(
          and(
            eq(assignmentQueue.userId, String(userId)),
            eq(assignmentQueue.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
  
      if (existing) {
        const count = Number(existing.assignmentCount) || 0;
        await db
          .update(assignmentQueue)
          .set({
            lastAssignedAt: now,
            assignmentCount: String(count + 1),
          })
          .where(eq(assignmentQueue.id, existing.id));
      } else {
        await db.insert(assignmentQueue).values({
          userId: String(userId),
          institutionId: String(institutionId),
          lastAssignedAt: now,
          assignmentCount: String(1),
        });
      }
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
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

/**
 * Batch-record multiple assignments using pre-fetched queue records.
 * Groups increments by user and does ONE sequential PATCH/POST per user
 * instead of N parallel fire-and-forget calls.
 */
export const recordAssignmentsBatch = async (
  assignments: Array<{ userId: number; institutionId: number }>,
  existingRecords: QueueRecord[],
): Promise<void> => {
  if (assignments.length === 0) return;

  const now = new Date().toISOString();

  // Group assignment counts by userId
  const countsByUser = new Map<number, number>();
  for (const a of assignments) {
    countsByUser.set(a.userId, (countsByUser.get(a.userId) ?? 0) + 1);
  }

  // Build a map of existing records by user_id
  const recordMap = new Map<number, QueueRecord>();
  for (const rec of existingRecords) {
    recordMap.set(Number(rec.user_id), rec);
  }

  if (useDirectDb("assignment")) {
    const _ok = await tryDrizzle(async () => {
      for (const [userId, increment] of countsByUser) {
        try {
          const existing = recordMap.get(userId);
          if (existing) {
            const currentCount = Number(existing.assignment_count) || 0;
            await db
              .update(assignmentQueue)
              .set({
                lastAssignedAt: now,
                assignmentCount: String(currentCount + increment),
              })
              .where(eq(assignmentQueue.id, existing.id));
          } else {
            const instId = assignments.find((a) => a.userId === userId)!.institutionId;
            await db.insert(assignmentQueue).values({
              userId: String(userId),
              institutionId: String(instId),
              lastAssignedAt: now,
              assignmentCount: String(increment),
            });
          }
        } catch (err) {
          console.error(`Erro ao registrar assignment batch para user ${userId}:`, err);
        }
      }
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  // Process each user SEQUENTIALLY to avoid lock contention
  for (const [userId, increment] of countsByUser) {
    try {
      const existing = recordMap.get(userId);
      if (existing) {
        const currentCount = Number(existing.assignment_count) || 0;
        await client().patch(
          `/database/rows/table/${TABLE_ID}/${existing.id}/?user_field_names=true`,
          {
            last_assigned_at: now,
            assignment_count: currentCount + increment,
          },
        );
      } else {
        const instId = assignments.find((a) => a.userId === userId)!.institutionId;
        await client().post(
          `/database/rows/table/${TABLE_ID}/?user_field_names=true`,
          {
            user_id: userId,
            institution_id: instId,
            last_assigned_at: now,
            assignment_count: increment,
          },
        );
      }
    } catch (err) {
      console.error(`Erro ao registrar assignment batch para user ${userId}:`, err);
    }
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

/** Count actual cases currently assigned to a user in the cases table */
const countUserCases = async (
  userId: number,
  institutionId: number,
): Promise<number> => {
  if (useDirectDb("assignment")) {
    const _dr = await tryDrizzle(async () => {
      const [result] = await prepared.countUserCases.execute({
        userId: String(userId),
        institutionId: String(institutionId),
      });
      return Number(result?.count ?? 0);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "1",
    filter__assigned_to_user_id__equal: String(userId),
    filter__InstitutionID__equal: String(institutionId),
  });
  const url = `/database/rows/table/${CASES_TABLE_ID}/?${params.toString()}`;
  const response = await client().get<{ count?: number }>(url);
  return response.data.count ?? 0;
};

export const fetchUserQueueStats = async (
  userId: number,
  institutionId: number,
  eligibleUserIds: number[],
): Promise<QueueStats> => {
  const [records, assignedCount] = await Promise.all([
    fetchQueueRecords(institutionId),
    countUserCases(userId, institutionId),
  ]);

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
    position: position > 0 ? position : 0,
    totalAssigned: assignedCount,
    lastAssignedAt: userRec?.last_assigned_at || null,
    totalEligible: eligibleUserIds.length,
  };
};

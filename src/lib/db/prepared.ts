/**
 * Prepared Statements — Drizzle ORM
 *
 * Queries pré-compiladas no PostgreSQL para as operações mais frequentes.
 * Reduz overhead de parsing SQL em queries repetitivas (auth, cases, departments).
 *
 * Uso:
 *   import { prepared } from "@/lib/db/prepared";
 *   const rows = await prepared.getUsersByInstitution.execute({ institutionId: "123" });
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema/users";
import { cases } from "./schema/cases";
import { userDepartments } from "./schema/userDepartments";
import { assignmentQueue } from "./schema/assignmentQueue";
import { pushSubscriptions } from "./schema/pushSubscriptions";

// ---------------------------------------------------------------------------
// Users (table 236) — Auth + RBAC, highest frequency
// ---------------------------------------------------------------------------

/** fetchInstitutionUsersRaw — all users of an institution */
const getUsersByInstitution = db
  .select()
  .from(users)
  .where(eq(users.institutionId, sql.placeholder("institutionId")))
  .prepare("get_users_by_institution");

/** authenticateViaUsersTable — lookup by email (limit 10 for multi-institution) */
const getUsersByEmail = db
  .select()
  .from(users)
  .where(eq(users.email, sql.placeholder("email")))
  .limit(10)
  .prepare("get_users_by_email");

/** findExistingUser — by legacyUserId + institutionId */
const getUserByLegacyAndInstitution = db
  .select()
  .from(users)
  .where(
    and(
      eq(users.legacyUserId, sql.placeholder("legacyUserId")),
      eq(users.institutionId, sql.placeholder("institutionId")),
    ),
  )
  .limit(1)
  .prepare("get_user_by_legacy_institution");

/** findExistingUser — by email + institutionId */
const getUserByEmailAndInstitution = db
  .select()
  .from(users)
  .where(
    and(
      eq(users.email, sql.placeholder("email")),
      eq(users.institutionId, sql.placeholder("institutionId")),
    ),
  )
  .limit(1)
  .prepare("get_user_by_email_institution");

// ---------------------------------------------------------------------------
// Cases (table 225) — Dashboard + Kanban, very high frequency
// ---------------------------------------------------------------------------

/** getBaserowCaseById — single case lookup */
const getCaseById = db
  .select()
  .from(cases)
  .where(eq(cases.id, sql.placeholder("id")))
  .limit(1)
  .prepare("get_case_by_id");

/** countUserCases — assignment queue round-robin */
const countUserCases = db
  .select({ count: sql<number>`cast(count(*) as integer)` })
  .from(cases)
  .where(
    and(
      eq(cases.assignedToUserId, sql.placeholder("userId")),
      eq(cases.institutionID, sql.placeholder("institutionId")),
    ),
  )
  .prepare("count_user_cases");

// ---------------------------------------------------------------------------
// User Departments (table 248) — Authorization filters
// ---------------------------------------------------------------------------

/** getUserDepartmentIds — departments for a user */
const getDeptsByUserAndInstitution = db
  .select({ departmentId: userDepartments.departmentId })
  .from(userDepartments)
  .where(
    and(
      eq(userDepartments.userId, sql.placeholder("userId")),
      eq(userDepartments.institutionId, sql.placeholder("institutionId")),
    ),
  )
  .prepare("get_depts_by_user_institution");

/** fetchDepartmentUserIds — users in a department */
const getUsersByDepartment = db
  .select({ userId: userDepartments.userId })
  .from(userDepartments)
  .where(eq(userDepartments.departmentId, sql.placeholder("departmentId")))
  .prepare("get_users_by_department");

// ---------------------------------------------------------------------------
// Assignment Queue (table 251)
// ---------------------------------------------------------------------------

/** fetchQueueRecords — all queue entries for an institution */
const getQueueByInstitution = db
  .select()
  .from(assignmentQueue)
  .where(eq(assignmentQueue.institutionId, sql.placeholder("institutionId")))
  .prepare("get_queue_by_institution");

// ---------------------------------------------------------------------------
// Push Subscriptions (table 254)
// ---------------------------------------------------------------------------

/** getSubscriptionsByInstitution — push notification targets */
const getSubsByInstitution = db
  .select()
  .from(pushSubscriptions)
  .where(eq(pushSubscriptions.institutionId, sql.placeholder("institutionId")))
  .prepare("get_subs_by_institution");

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const prepared = {
  // Users
  getUsersByInstitution,
  getUsersByEmail,
  getUserByLegacyAndInstitution,
  getUserByEmailAndInstitution,
  // Cases
  getCaseById,
  countUserCases,
  // Departments
  getDeptsByUserAndInstitution,
  getUsersByDepartment,
  // Assignment Queue
  getQueueByInstitution,
  // Push
  getSubsByInstitution,
} as const;

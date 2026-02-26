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

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema/users";
import { cases } from "./schema/cases";
import { caseMessages } from "./schema/caseMessages";
import { userDepartments } from "./schema/userDepartments";
import { assignmentQueue } from "./schema/assignmentQueue";
import { pushSubscriptions } from "./schema/pushSubscriptions";
import { config } from "./schema/config";
import { kanbanColumns } from "./schema/kanbanColumns";
import { followUpConfig } from "./schema/followUpConfig";
import { caseKanbanStatus } from "./schema/caseKanbanStatus";

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
// Chat Messages (table 227) — Chat polling, highest volume
// ---------------------------------------------------------------------------

/** getMessagesByCaseId — messages for a case, sorted chronologically */
const getMessagesByCaseId = db
  .select()
  .from(caseMessages)
  .where(eq(caseMessages.caseId, sql.placeholder("caseId")))
  .orderBy(asc(caseMessages.createdOn), asc(caseMessages.id))
  .prepare("get_messages_by_case_id");

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
// Config (table 224) — App configuration, loaded on every page
// ---------------------------------------------------------------------------

/** getBaserowConfigs — configs for an institution */
const getConfigsByInstitution = db
  .select()
  .from(config)
  .where(eq(config.bodyAuthInstitutionId, sql.placeholder("institutionId")))
  .prepare("get_configs_by_institution");

/** getBaserowConfigs — all configs (sysAdmin only) */
const getAllConfigs = db
  .select()
  .from(config)
  .prepare("get_all_configs");

// ---------------------------------------------------------------------------
// Kanban Columns (table 231) — Kanban board rendering
// ---------------------------------------------------------------------------

/** getKanbanColumns — columns for an institution */
const getKanbanColumnsByInstitution = db
  .select()
  .from(kanbanColumns)
  .where(eq(kanbanColumns.institutionId, sql.placeholder("institutionId")))
  .prepare("get_kanban_cols_by_institution");

// ---------------------------------------------------------------------------
// Follow-up Config (table 229)
// ---------------------------------------------------------------------------

/** getFollowUpConfigs — configs for an institution */
const getFollowUpConfigsByInstitution = db
  .select()
  .from(followUpConfig)
  .where(eq(followUpConfig.institutionId, sql.placeholder("institutionId")))
  .orderBy(asc(followUpConfig.messageOrder))
  .prepare("get_followup_configs_by_institution");

// ---------------------------------------------------------------------------
// Case Kanban Status (table 232)
// ---------------------------------------------------------------------------

/** getCaseKanbanStatus — status entries for a case */
const getKanbanStatusByCaseId = db
  .select()
  .from(caseKanbanStatus)
  .where(eq(caseKanbanStatus.caseId, sql.placeholder("caseId")))
  .prepare("get_kanban_status_by_case");

/** getCaseKanbanStatus — all statuses for an institution */
const getKanbanStatusByInstitution = db
  .select()
  .from(caseKanbanStatus)
  .where(eq(caseKanbanStatus.institutionId, sql.placeholder("institutionId")))
  .prepare("get_kanban_status_by_institution");

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
  // Chat Messages
  getMessagesByCaseId,
  // Departments
  getDeptsByUserAndInstitution,
  getUsersByDepartment,
  // Assignment Queue
  getQueueByInstitution,
  // Push
  getSubsByInstitution,
  // Config
  getConfigsByInstitution,
  getAllConfigs,
  // Kanban
  getKanbanColumnsByInstitution,
  getKanbanStatusByCaseId,
  getKanbanStatusByInstitution,
  // Follow-up
  getFollowUpConfigsByInstitution,
} as const;

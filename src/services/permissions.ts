import axios from "axios";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { prepared } from "@/lib/db/prepared";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { users as usersTable } from "@/lib/db/schema/users";
import { roles as rolesTable } from "@/lib/db/schema/roles";
import { menu as menuTable } from "@/lib/db/schema/menu";
import { permissions as permissionsTable } from "@/lib/db/schema/permissions";
import { rolePermissions as rolePermissionsTable } from "@/lib/db/schema/rolePermissions";
import { userRoles as userRolesTable } from "@/lib/db/schema/userRoles";
import { userFeatures as userFeaturesTable } from "@/lib/db/schema/userFeatures";
// auditPermissions import kept for future use if needed
// import { auditPermissions as auditPermissionsTable } from "@/lib/db/schema/auditPermissions";
import { config as configTable } from "@/lib/db/schema/config";

import {
  SYSTEM_FEATURES,
  ALL_FEATURE_PATHS,
  ADMIN_DEFAULT_FEATURES,
  USER_ACTION_FEATURES,
  type SystemFeature,
} from "@/lib/feature-registry";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const INSTITUTION_FIELD = "institution_id";
const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const isGlobalAdmin = (institutionId: number) =>
  institutionId === GLOBAL_ADMIN_INSTITUTION_ID;

// ---------------------------------------------------------------------------
// Server-side cache for raw user rows (shared across API routes)
// ---------------------------------------------------------------------------

const rawUsersCacheMap = new Map<
  number,
  { rows: BaserowUserRow[]; ts: number }
>();
const RAW_USERS_CACHE_TTL = 600_000; // 10 minutes

const DEFAULT_TABLES = {
  users: 236,
  roles: 237,
  menus: 238,
  permissions: 239,
  rolePermissions: 240,
  userRoles: 241,
  audit: 242,
  userFeatures: 250,
};

const TABLE_IDS = {
  users:
    Number(
      process.env.BASEROW_USERS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_USERS_TABLE_ID ??
        DEFAULT_TABLES.users,
    ) || DEFAULT_TABLES.users,
  roles:
    Number(
      process.env.BASEROW_ROLES_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_ROLES_TABLE_ID ??
        DEFAULT_TABLES.roles,
    ) || DEFAULT_TABLES.roles,
  menus:
    Number(
      process.env.BASEROW_MENU_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_MENU_TABLE_ID ??
        DEFAULT_TABLES.menus,
    ) || DEFAULT_TABLES.menus,
  permissions:
    Number(
      process.env.BASEROW_PERMISSIONS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_PERMISSIONS_TABLE_ID ??
        DEFAULT_TABLES.permissions,
    ) || DEFAULT_TABLES.permissions,
  rolePermissions:
    Number(
      process.env.BASEROW_ROLE_PERMISSION_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_ROLE_PERMISSION_TABLE_ID ??
        DEFAULT_TABLES.rolePermissions,
    ) || DEFAULT_TABLES.rolePermissions,
  userRoles:
    Number(
      process.env.BASEROW_USER_ROLE_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_USER_ROLE_TABLE_ID ??
        DEFAULT_TABLES.userRoles,
    ) || DEFAULT_TABLES.userRoles,
  audit:
    Number(
      process.env.BASEROW_AUDIT_PERMISSION_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_AUDIT_PERMISSION_TABLE_ID ??
        DEFAULT_TABLES.audit,
    ) || DEFAULT_TABLES.audit,
  userFeatures:
    Number(
      process.env.BASEROW_USER_FEATURES_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_USER_FEATURES_TABLE_ID ??
        DEFAULT_TABLES.userFeatures,
    ) || DEFAULT_TABLES.userFeatures,
};

type LinkCell = { id: number; value?: string } | number;

type BaserowListResponse<T> = {
  results?: T[];
};

export type BaserowUserRow = {
  id: number;
  legacy_user_id?: string;
  email?: string;
  name?: string;
  password?: string;
  phone?: string;
  OAB?: string;
  is_active?: boolean;
  is_office_admin?: boolean;
  receives_cases?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type UserPublicRow = {
  id: number;
  name: string;
  email: string;
  phone: string;
  oab: string;
  isActive: boolean;
  isOfficeAdmin: boolean;
  receivesCases: boolean;
  institutionId?: number;
};

export type SyncUserParams = {
  institutionId: number;
  legacyUserId: string;
  email?: string;
  name?: string;
  password?: string;
  isActive?: boolean;
};

export type SyncUserResult = {
  user: BaserowUserRow;
  created: boolean;
};

export type PermissionRow = {
  id: number;
  code?: string;
  description?: string;
  menu_id?: LinkCell[] | null;
  [key: string]: unknown;
};

export type MenuRow = {
  id: number;
  label?: string;
  path?: string;
  parent_id?: LinkCell[] | null;
  display_order?: number;
  is_active?: boolean;
  [key: string]: unknown;
};

export type RoleRow = {
  id: number;
  name?: string;
  description?: string;
  is_system?: boolean;
  [key: string]: unknown;
};

export type RolePermissionRow = {
  id: number;
  role_id?: LinkCell[] | null;
  permission_id?: LinkCell[] | null;
  [key: string]: unknown;
};

export type UserRoleRow = {
  id: number;
  user_id?: LinkCell[] | null;
  role_id?: LinkCell[] | null;
  [key: string]: unknown;
};

export type UserFeatureRow = {
  id: number;
  user_id: number | string;
  institution_id: number | string;
  feature_key: string;
  is_enabled: boolean | string;
  [key: string]: unknown;
};

export type PermissionsOverview = {
  isSysAdmin: boolean;
  isGlobalAdmin: boolean;
  targetInstitutionId: number;
  roles: Array<{
    id: number;
    name: string;
    description?: string;
    isSystem: boolean;
    permissionIds: number[];
  }>;
  permissions: Array<{
    id: number;
    code: string;
    description?: string;
    menuId?: number | null;
  }>;
  menus: Array<{
    id: number;
    label: string;
    path?: string;
    parentId?: number | null;
    order?: number;
    isActive: boolean;
  }>;
  users: Array<{
    id: number;
    name?: string;
    email?: string;
    legacyUserId?: string;
  }>;
  userRoles: Array<{
    id: number;
    userId: number;
    roleId: number;
  }>;
};

const ensureEnv = () => {
  if (!BASEROW_API_URL) {
    throw new Error("BASEROW_API_URL não configurado");
  }
  if (!BASEROW_API_KEY) {
    throw new Error("BASEROW_API_KEY não configurado");
  }
};

const baserowClient = () => {
  ensureEnv();
  return axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
};

const withInstitutionFilter = (
  params: URLSearchParams,
  institutionId: number,
) => {
  params.append(`filter__${INSTITUTION_FIELD}__equal`, String(institutionId));
};

const fetchTableRows = async <T>(
  tableId: number,
  params?: URLSearchParams,
): Promise<T[]> => {
  const client = baserowClient();
  const searchParams = params ?? new URLSearchParams();
  if (!searchParams.has("user_field_names")) {
    searchParams.set("user_field_names", "true");
  }
  const url = `/database/rows/table/${tableId}/?${searchParams.toString()}`;
  const response = await client.get<BaserowListResponse<T>>(url);
  return response.data.results ?? [];
};

const deleteRow = async (tableId: number, rowId: number) => {
  const client = baserowClient();
  await client.delete(`/database/rows/table/${tableId}/${rowId}/`);
};

const createRow = async <T>(
  tableId: number,
  payload: Record<string, unknown>,
) => {
  const client = baserowClient();
  const url = `/database/rows/table/${tableId}/?user_field_names=true`;
  const response = await client.post<T>(url, payload);
  return response.data;
};

const extractLinkIds = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "number") {
          return entry;
        }
        if (entry && typeof entry === "object" && "id" in entry) {
          const idValue = (entry as Record<string, unknown>).id;
          if (typeof idValue === "number") {
            return idValue;
          }
        }
        return null;
      })
      .filter((id): id is number => id !== null);
  }
  return [];
};

// ---------------------------------------------------------------------------
// Drizzle row mappers
// ---------------------------------------------------------------------------

function mapUserRow(r: typeof usersTable.$inferSelect): BaserowUserRow {
  return {
    id: r.id,
    legacy_user_id: r.legacyUserId ?? undefined,
    email: r.email ?? undefined,
    name: r.name ?? undefined,
    password: r.password ?? undefined,
    phone: r.phone ?? undefined,
    OAB: r.oab ?? undefined,
    is_active: r.isActive ?? undefined,
    is_office_admin: r.isOfficeAdmin ?? undefined,
    receives_cases: r.receivesCases ?? undefined,
    created_at: r.createdAt?.toISOString() ?? undefined,
    updated_at: r.updatedAt?.toISOString() ?? undefined,
    institution_id: r.institutionId ? Number(r.institutionId) : undefined,
  };
}

function mapRoleRow(r: typeof rolesTable.$inferSelect): RoleRow {
  return {
    id: r.id,
    name: r.name ?? undefined,
    description: r.description ?? undefined,
    is_system: r.isSystem ?? undefined,
    institution_id: r.institutionId ? Number(r.institutionId) : undefined,
  };
}

function mapPermissionRow(r: typeof permissionsTable.$inferSelect): PermissionRow {
  return {
    id: r.id,
    code: r.code ?? undefined,
    description: r.description ?? undefined,
    // permissionsTable doesn't have menuId in PG schema — this field
    // comes from a link_row that was skipped. For now return undefined.
    menu_id: undefined,
  };
}

function mapMenuRow(r: typeof menuTable.$inferSelect): MenuRow {
  return {
    id: r.id,
    label: r.label ?? undefined,
    path: r.path ?? undefined,
    parent_id: r.parentId as LinkCell[] | null | undefined,
    display_order: r.displayOrder ? Number(r.displayOrder) : undefined,
    is_active: r.isActive ?? undefined,
    institution_id: r.institutionId ? Number(r.institutionId) : undefined,
  };
}

function mapRolePermissionRow(r: typeof rolePermissionsTable.$inferSelect): RolePermissionRow {
  return {
    id: r.id,
    role_id: r.roleId as LinkCell[] | null | undefined,
    permission_id: r.permissionId as LinkCell[] | null | undefined,
  };
}

function mapUserRoleRow(r: typeof userRolesTable.$inferSelect): UserRoleRow {
  return {
    id: r.id,
    user_id: r.userId as LinkCell[] | null | undefined,
    role_id: r.roleId as LinkCell[] | null | undefined,
  };
}

function mapUserFeatureRow(r: typeof userFeaturesTable.$inferSelect): UserFeatureRow {
  return {
    id: r.id,
    user_id: r.userId ? Number(r.userId) : 0,
    institution_id: r.institutionId ? Number(r.institutionId) : 0,
    feature_key: r.featureKey ?? "",
    is_enabled: r.isEnabled ?? false,
  };
}

// ---------------------------------------------------------------------------
// Cached raw user fetch + robust finder
// ---------------------------------------------------------------------------

const fetchInstitutionUsersRaw = async (
  institutionId: number,
): Promise<BaserowUserRow[]> => {
  // Cache shared by both Drizzle and Baserow paths
  const cached = rawUsersCacheMap.get(institutionId);
  if (cached && Date.now() - cached.ts < RAW_USERS_CACHE_TTL) {
    return cached.rows;
  }

  // --- Drizzle branch (prepared statement) ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await prepared.getUsersByInstitution.execute({
        institutionId: String(institutionId),
      });
      return rows.map(mapUserRow);
    });
    if (_dr !== undefined) {
      rawUsersCacheMap.set(institutionId, { rows: _dr, ts: Date.now() });
      return _dr;
    }
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
  });
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  rawUsersCacheMap.set(institutionId, { rows, ts: Date.now() });
  return rows;
};

/**
 * Robust user finder with triple matching.
 * Priority: legacy_user_id field → Baserow row.id → email → legacyId-as-email.
 */
export const findUserInInstitution = async (
  institutionId: number,
  legacyUserId: string,
  email?: string,
): Promise<BaserowUserRow | null> => {
  const users = await fetchInstitutionUsersRaw(institutionId);
  const legacyLower = legacyUserId.toLowerCase();
  const emailLower = email?.trim().toLowerCase();

  // 1. Match by legacy_user_id column
  const byLegacy = users.find(
    (u) =>
      u.legacy_user_id &&
      u.legacy_user_id.toLowerCase() === legacyLower,
  );
  if (byLegacy) return byLegacy;

  // 2. Match by Baserow row ID (legacyUserId is often String(row.id))
  const numericId = Number(legacyUserId);
  if (Number.isFinite(numericId) && numericId > 0) {
    const byId = users.find((u) => u.id === numericId);
    if (byId) return byId;
  }

  // 3. Match by email from auth payload
  if (emailLower) {
    const byEmail = users.find(
      (u) => u.email && u.email.toLowerCase() === emailLower,
    );
    if (byEmail) return byEmail;
  }

  // 4. legacyUserId might itself be an email
  if (legacyLower.includes("@")) {
    const byLegacyEmail = users.find(
      (u) => u.email && u.email.toLowerCase() === legacyLower,
    );
    if (byLegacyEmail) return byLegacyEmail;
  }

  return null;
};

/**
 * Invalidate the server-side users cache (call after user CRUD).
 */
export const invalidateUsersCache = (institutionId?: number): void => {
  if (institutionId !== undefined) {
    rawUsersCacheMap.delete(institutionId);
  } else {
    rawUsersCacheMap.clear();
  }
};

const buildUserPayload = (params: SyncUserParams) => {
  const payload: Record<string, unknown> = {
    [INSTITUTION_FIELD]: params.institutionId,
    legacy_user_id: params.legacyUserId,
  };
  if (params.email) {
    payload.email = params.email.trim().toLowerCase();
  }
  if (params.name) {
    payload.name = params.name.trim();
  }
  if (params.password) {
    payload.password = params.password;
  }
  if (typeof params.isActive === "boolean") {
    payload.is_active = params.isActive;
  }
  return payload;
};

const findExistingUser = async (params: SyncUserParams) => {
  // --- Drizzle branch (prepared statements) ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const byLegacy = await prepared.getUserByLegacyAndInstitution.execute({
        legacyUserId: params.legacyUserId,
        institutionId: String(params.institutionId),
      });
      if (byLegacy.length > 0) return mapUserRow(byLegacy[0]);
  
      if (params.email) {
        const byEmail = await prepared.getUserByEmailAndInstitution.execute({
          email: params.email.trim().toLowerCase(),
          institutionId: String(params.institutionId),
        });
        if (byEmail.length > 0) return mapUserRow(byEmail[0]);
      }
      return null;
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  // 1. Buscar por legacy_user_id (prioridade)
  const legacyParams = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  legacyParams.append("filter__legacy_user_id__equal", params.legacyUserId);
  withInstitutionFilter(legacyParams, params.institutionId);

  const byLegacy = await fetchTableRows<BaserowUserRow>(
    TABLE_IDS.users,
    legacyParams,
  );
  if (byLegacy.length > 0) {
    return byLegacy[0];
  }

  // 2. Fallback: buscar por email na mesma instituição
  if (params.email) {
    const emailParams = new URLSearchParams({
      user_field_names: "true",
      size: "1",
    });
    emailParams.append(
      "filter__email__equal",
      params.email.trim().toLowerCase(),
    );
    withInstitutionFilter(emailParams, params.institutionId);

    const byEmail = await fetchTableRows<BaserowUserRow>(
      TABLE_IDS.users,
      emailParams,
    );
    if (byEmail.length > 0) {
      return byEmail[0];
    }
  }

  return null;
};

export const syncUserRecord = async (
  params: SyncUserParams,
): Promise<SyncUserResult> => {
  const existing = await findExistingUser(params);

  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const setFields: Partial<Record<string, unknown>> = {
        institutionId: String(params.institutionId),
        legacyUserId: params.legacyUserId,
      };
      if (params.email) setFields.email = params.email.trim().toLowerCase();
      if (params.name) setFields.name = params.name.trim();
      if (params.password) setFields.password = params.password;
      if (typeof params.isActive === "boolean") setFields.isActive = params.isActive;
  
      if (existing) {
        const updated = await db
          .update(usersTable)
          .set({ ...setFields, updatedAt: new Date() } as typeof usersTable.$inferInsert)
          .where(eq(usersTable.id, existing.id))
          .returning();
        return { user: mapUserRow(updated[0]), created: false };
      }
  
      const inserted = await db
        .insert(usersTable)
        .values({
          ...setFields,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof usersTable.$inferInsert)
        .returning();
      return { user: mapUserRow(inserted[0]), created: true };
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const payload = buildUserPayload(params);

  if (existing) {
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_IDS.users}/${existing.id}/?user_field_names=true`;
    const response = await client.patch<BaserowUserRow>(url, payload);
    return { user: response.data, created: false };
  }

  const user = await createRow<BaserowUserRow>(TABLE_IDS.users, payload);
  return { user, created: true };
};

const findUserByLegacy = async (
  institutionId: number,
  legacyUserId: string,
) => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.legacyUserId, legacyUserId),
            eq(usersTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      return rows.length > 0 ? mapUserRow(rows[0]) : null;
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  params.append("filter__legacy_user_id__equal", legacyUserId);
  withInstitutionFilter(params, institutionId);
  const users = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  return users[0] ?? null;
};

const fetchUserRoleRows = async (institutionId: number) => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      // userRoles table (241) has no institution_id column in PG.
      // Fetch all rows; calling code filters by user/role IDs.
      const rows = await db.select().from(userRolesTable);
      return rows.map(mapUserRoleRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(params, institutionId);
  return fetchTableRows<UserRoleRow>(TABLE_IDS.userRoles, params);
};

const fetchRolePermissionRows = async (institutionId: number) => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      // rolePermissions table (240) has no institution_id column in PG.
      // Fetch all rows; calling code filters by role/permission IDs.
      const rows = await db.select().from(rolePermissionsTable);
      return rows.map(mapRolePermissionRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(params, institutionId);
  return fetchTableRows<RolePermissionRow>(TABLE_IDS.rolePermissions, params);
};

const fetchRoleRowsForInstitution = async (
  institutionId: number,
): Promise<RoleRow[]> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.institutionId, String(institutionId)));
      return rows.map(mapRoleRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const p = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(p, institutionId);
  return fetchTableRows<RoleRow>(TABLE_IDS.roles, p);
};

const fetchPermissionRowsForInstitution = async (
  institutionId: number,
): Promise<PermissionRow[]> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select()
        .from(permissionsTable)
        .where(eq(permissionsTable.institutionId, String(institutionId)));
      return rows.map(mapPermissionRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const p = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(p, institutionId);
  return fetchTableRows<PermissionRow>(TABLE_IDS.permissions, p);
};

const loadCurrentUserContext = async (
  institutionId: number,
  legacyUserId: string,
  email?: string,
) => {
  const user = await findUserInInstitution(institutionId, legacyUserId, email);
  if (!user) {
    throw new Error("Usuário não encontrado na base de permissões");
  }

  const [roles, userRoleRows] = await Promise.all([
    fetchRoleRowsForInstitution(institutionId),
    fetchUserRoleRows(institutionId),
  ]);

  const userRoleIds = userRoleRows
    .filter((row) => extractLinkIds(row.user_id).includes(user.id))
    .flatMap((row) => extractLinkIds(row.role_id));

  const sysRole = roles.find(
    (role) => (role.name ?? "").toString().toLowerCase() === "sysadmin",
  );
  const isSysAdmin = sysRole ? userRoleIds.includes(sysRole.id) : false;

  return { user, isSysAdmin, userRoleRows, roles };
};

export const fetchPermissionsOverview = async (
  institutionId: number,
  legacyUserId: string,
  targetInstitutionId?: number,
): Promise<PermissionsOverview> => {
  const globalAdmin = isGlobalAdmin(institutionId);
  const effectiveInstitutionId = targetInstitutionId ?? institutionId;

  // Non-global-admin trying to access another institution
  if (targetInstitutionId && targetInstitutionId !== institutionId && !globalAdmin) {
    return {
      isSysAdmin: false,
      isGlobalAdmin: false,
      targetInstitutionId: effectiveInstitutionId,
      roles: [],
      permissions: [],
      menus: [],
      users: [],
      userRoles: [],
    };
  }

  // Global admin bypasses sysAdmin check for any institution
  let isSysAdmin = globalAdmin;
  let userRoleRows: UserRoleRow[] = [];
  let roles: RoleRow[] = [];

  if (!globalAdmin) {
    const ctx = await loadCurrentUserContext(institutionId, legacyUserId);
    isSysAdmin = ctx.isSysAdmin;
    userRoleRows = ctx.userRoleRows;
    roles = ctx.roles;
  }

  if (!isSysAdmin) {
    return {
      isSysAdmin: false,
      isGlobalAdmin: false,
      targetInstitutionId: effectiveInstitutionId,
      roles: [],
      permissions: [],
      menus: [],
      users: [],
      userRoles: [],
    };
  }

  // If global admin targeting another institution, load that institution's data
  if (globalAdmin) {
    const [r, ur] = await Promise.all([
      fetchRoleRowsForInstitution(effectiveInstitutionId),
      fetchUserRoleRows(effectiveInstitutionId),
    ]);
    roles = r;
    userRoleRows = ur;
  }

  const [permissions, menus, rolePermissionRows, users] = await Promise.all([
    fetchPermissionRowsForInstitution(effectiveInstitutionId),
    fetchMenuRowsForInstitution(effectiveInstitutionId),
    fetchRolePermissionRows(effectiveInstitutionId),
    fetchInstitutionUsersRaw(effectiveInstitutionId),
  ]);

  const rolesFormatted = roles.map((role) => {
    const permissionIds = rolePermissionRows
      .filter((row) => extractLinkIds(row.role_id).includes(role.id))
      .flatMap((row) => extractLinkIds(row.permission_id));
    return {
      id: role.id,
      name: (role.name as string) ?? `Role #${role.id}`,
      description: role.description as string | undefined,
      isSystem: Boolean(role.is_system),
      permissionIds,
    };
  });

  const permissionsFormatted = permissions.map((perm) => ({
    id: perm.id,
    code: (perm.code as string) ?? `perm_${perm.id}`,
    description: perm.description as string | undefined,
    menuId: extractLinkIds(perm.menu_id)[0] ?? null,
  }));

  const menusFormatted = menus.map((menu) => ({
    id: menu.id,
    label: (menu.label as string) ?? `Menu #${menu.id}`,
    path: menu.path as string | undefined,
    parentId: extractLinkIds(menu.parent_id)[0] ?? null,
    order:
      typeof menu.display_order === "number" ? menu.display_order : undefined,
    isActive: isActiveValue(menu.is_active),
  }));

  const usersFormatted = users.map((row) => ({
    id: row.id,
    name: row.name as string | undefined,
    email: row.email as string | undefined,
    legacyUserId: row.legacy_user_id as string | undefined,
  }));

  const formattedUserRoles = userRoleRows
    .map((row) => {
      const userIds = extractLinkIds(row.user_id);
      const roleIds = extractLinkIds(row.role_id);
      if (!userIds[0] || !roleIds[0]) {
        return null;
      }
      return { id: row.id, userId: userIds[0], roleId: roleIds[0] };
    })
    .filter((entry): entry is { id: number; userId: number; roleId: number } =>
      Boolean(entry),
    );

  return {
    isSysAdmin: true,
    isGlobalAdmin: globalAdmin,
    targetInstitutionId: effectiveInstitutionId,
    roles: rolesFormatted,
    permissions: permissionsFormatted,
    menus: menusFormatted,
    users: usersFormatted,
    userRoles: formattedUserRoles,
  };
};

const fetchMenuRowsForInstitution = async (
  institutionId: number,
): Promise<MenuRow[]> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select()
        .from(menuTable)
        .where(eq(menuTable.institutionId, String(institutionId)));
      return rows.map(mapMenuRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(params, institutionId);
  return fetchTableRows<MenuRow>(TABLE_IDS.menus, params);
};

const isActiveValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return lower !== "false" && lower !== "0" && lower !== "";
  }
  return value !== false && value !== 0 && value !== null && value !== undefined;
};

const getEnabledPagesForInstitution = async (
  institutionId: number,
): Promise<string[]> => {
  const rows = await fetchMenuRowsForInstitution(institutionId);
  if (rows.length === 0) {
    return ALL_FEATURE_PATHS;
  }
  return rows
    .filter((row) => isActiveValue(row.is_active) && row.path)
    .map((row) => row.path as string);
};

// ---------------------------------------------------------------------------
// Server-side cache for full permissions status result
// ---------------------------------------------------------------------------

type PermissionsStatusResult = {
  isSysAdmin: boolean;
  isGlobalAdmin: boolean;
  isOfficeAdmin: boolean;
  userId: number;
  enabledPages: string[];
  enabledActions: string[];
};

const permissionsStatusCacheMap = new Map<
  string,
  { result: PermissionsStatusResult; ts: number }
>();
const PERMISSIONS_STATUS_CACHE_TTL = 600_000; // 10 minutes

export const invalidatePermissionsStatusCache = (
  institutionId?: number,
  legacyUserId?: string,
): void => {
  if (institutionId !== undefined && legacyUserId) {
    permissionsStatusCacheMap.delete(`${institutionId}:${legacyUserId}`);
  } else {
    permissionsStatusCacheMap.clear();
  }
};

export const fetchPermissionsStatus = async (
  institutionId: number,
  legacyUserId: string,
  email?: string,
): Promise<PermissionsStatusResult> => {
  const cacheKey = `${institutionId}:${legacyUserId}`;
  const cached = permissionsStatusCacheMap.get(cacheKey);
  if (cached && Date.now() - cached.ts < PERMISSIONS_STATUS_CACHE_TTL) {
    return cached.result;
  }

  const result = await _fetchPermissionsStatusUncached(
    institutionId,
    legacyUserId,
    email,
  );

  permissionsStatusCacheMap.set(cacheKey, { result, ts: Date.now() });
  return result;
};

const _fetchPermissionsStatusUncached = async (
  institutionId: number,
  legacyUserId: string,
  email?: string,
): Promise<PermissionsStatusResult> => {
  const globalAdmin = isGlobalAdmin(institutionId);

  const allActionKeys = USER_ACTION_FEATURES.map((f) => f.key);

  if (globalAdmin) {
    return {
      isSysAdmin: true,
      isGlobalAdmin: true,
      isOfficeAdmin: false,
      userId: 0,
      enabledPages: ALL_FEATURE_PATHS,
      enabledActions: allActionKeys,
    };
  }

  // Run institution pages + user context in parallel
  const [enabledPages, ctxResult] = await Promise.all([
    getEnabledPagesForInstitution(institutionId),
    loadCurrentUserContext(institutionId, legacyUserId, email)
      .then((ctx) => ({
        isSysAdmin: ctx.isSysAdmin,
        isOfficeAdmin: isActiveValue(ctx.user.is_office_admin),
        userId: ctx.user.id,
      }))
      .catch((error) => {
        console.warn(
          "[fetchPermissionsStatus] user context failed:",
          error instanceof Error ? error.message : error,
        );
        return { isSysAdmin: false, isOfficeAdmin: false, userId: 0 };
      }),
  ]);

  const { isSysAdmin, isOfficeAdmin, userId } = ctxResult;

  // Admins see everything
  if (isSysAdmin || isOfficeAdmin) {
    return {
      isSysAdmin,
      isGlobalAdmin: false,
      isOfficeAdmin,
      userId,
      enabledPages: ALL_FEATURE_PATHS,
      enabledActions: allActionKeys,
    };
  }

  // Regular user: filter admin-default features based on user_features table
  const adminDefaultPaths = new Set(
    SYSTEM_FEATURES
      .filter((f) => ADMIN_DEFAULT_FEATURES.includes(f.key))
      .map((f) => f.path),
  );

  let filteredPages = enabledPages;
  let enabledActions: string[] = [];
  if (userId > 0) {
    try {
      const userEnabledKeys = await getUserEnabledFeatureKeys(userId, institutionId);
      filteredPages = enabledPages.filter((path) => {
        if (!adminDefaultPaths.has(path)) return true;
        const feature = SYSTEM_FEATURES.find((f) => f.path === path);
        return feature ? userEnabledKeys.has(feature.key) : true;
      });
      // Resolve action features
      enabledActions = allActionKeys.filter((key) => userEnabledKeys.has(key));
    } catch (error) {
      console.warn(
        "[fetchPermissionsStatus] user features lookup failed:",
        error instanceof Error ? error.message : error,
      );
      filteredPages = enabledPages.filter((path) => !adminDefaultPaths.has(path));
    }
  } else {
    filteredPages = enabledPages.filter((path) => !adminDefaultPaths.has(path));
  }

  return {
    isSysAdmin,
    isGlobalAdmin: false,
    isOfficeAdmin,
    userId,
    enabledPages: filteredPages,
    enabledActions,
  };
};

const assertSysAdmin = async (
  institutionId: number,
  legacyUserId: string,
) => {
  if (isGlobalAdmin(institutionId)) {
    return;
  }
  const { isSysAdmin } = await loadCurrentUserContext(
    institutionId,
    legacyUserId,
  );
  if (!isSysAdmin) {
    throw new Error("Apenas o sysadmin pode executar esta ação.");
  }
};

const setRolePermissions = async (
  institutionId: number,
  legacyUserId: string,
  roleId: number,
  permissionIds: number[],
  targetInstitutionId?: number,
) => {
  await assertSysAdmin(institutionId, legacyUserId);
  const effectiveId = targetInstitutionId ?? institutionId;
  const rows = await fetchRolePermissionRows(effectiveId);
  const currentRows = rows.filter((row) =>
    extractLinkIds(row.role_id).includes(roleId),
  );
  const currentPermissionIds = currentRows
    .map((row) => extractLinkIds(row.permission_id)[0])
    .filter((id): id is number => Number.isFinite(id));

  const toDelete = currentRows
    .filter((row) => {
      const id = extractLinkIds(row.permission_id)[0];
      return id && !permissionIds.includes(id);
    })
    .map((row) => row.id);

  const toAdd = permissionIds.filter(
    (id) => !currentPermissionIds.includes(id),
  );

  // --- Drizzle branch (delete + create) ---
  if (useDirectDb("permissions")) {
    const _ok = await tryDrizzle("permissions", async () => {
      await Promise.all(
        toDelete.map((rowId) =>
          db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.id, rowId)),
        ),
      );
      await Promise.all(
        toAdd.map((permissionId) =>
          db.insert(rolePermissionsTable).values({
            roleId: [{ id: roleId }],
            permissionId: [{ id: permissionId }],
          }),
        ),
      );
    });
    if (_ok !== undefined) return;
  }
  // --- Baserow fallback ---
  await Promise.all(
    toDelete.map((rowId) => deleteRow(TABLE_IDS.rolePermissions, rowId)),
  );

  await Promise.all(
    toAdd.map((permissionId) =>
      createRow<RolePermissionRow>(TABLE_IDS.rolePermissions, {
        role_id: [roleId],
        permission_id: [permissionId],
        [INSTITUTION_FIELD]: effectiveId,
      }),
    ),
  );
};

const setUserRoles = async (
  institutionId: number,
  legacyUserId: string,
  userId: number,
  roleIds: number[],
  targetInstitutionId?: number,
) => {
  await assertSysAdmin(institutionId, legacyUserId);
  const effectiveId = targetInstitutionId ?? institutionId;
  const rows = await fetchUserRoleRows(effectiveId);
  const currentRows = rows.filter((row) =>
    extractLinkIds(row.user_id).includes(userId),
  );
  const currentRoleIds = currentRows
    .map((row) => extractLinkIds(row.role_id)[0])
    .filter((id): id is number => Number.isFinite(id));

  const toDelete = currentRows
    .filter((row) => {
      const id = extractLinkIds(row.role_id)[0];
      return id && !roleIds.includes(id);
    })
    .map((row) => row.id);

  const toAdd = roleIds.filter((id) => !currentRoleIds.includes(id));

  // --- Drizzle branch (delete + create) ---
  if (useDirectDb("permissions")) {
    const _ok = await tryDrizzle("permissions", async () => {
      await Promise.all(
        toDelete.map((rowId) =>
          db.delete(userRolesTable).where(eq(userRolesTable.id, rowId)),
        ),
      );
      await Promise.all(
        toAdd.map((rId) =>
          db.insert(userRolesTable).values({
            userId: [{ id: userId }],
            roleId: [{ id: rId }],
          }),
        ),
      );
    });
    if (_ok !== undefined) return;
  }
  // --- Baserow fallback ---
  await Promise.all(
    toDelete.map((rowId) => deleteRow(TABLE_IDS.userRoles, rowId)),
  );

  await Promise.all(
    toAdd.map((roleId) =>
      createRow<UserRoleRow>(TABLE_IDS.userRoles, {
        user_id: [userId],
        role_id: [roleId],
        [INSTITUTION_FIELD]: effectiveId,
      }),
    ),
  );
};

export const updateRolePermissions = async ({
  institutionId,
  legacyUserId,
  roleId,
  permissionIds,
  targetInstitutionId,
}: {
  institutionId: number;
  legacyUserId: string;
  roleId: number;
  permissionIds: number[];
  targetInstitutionId?: number;
}) => {
  await setRolePermissions(
    institutionId,
    legacyUserId,
    roleId,
    permissionIds,
    targetInstitutionId,
  );
};

export const updateUserRolesAssignments = async ({
  institutionId,
  legacyUserId,
  userId,
  roleIds,
  targetInstitutionId,
}: {
  institutionId: number;
  legacyUserId: string;
  userId: number;
  roleIds: number[];
  targetInstitutionId?: number;
}) => {
  await setUserRoles(institutionId, legacyUserId, userId, roleIds, targetInstitutionId);
};

const CONFIG_TABLE_ID =
  Number(
    process.env.BASEROW_CONFIG_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CONFIG_TABLE_ID ??
      224,
  ) || 224;

type BaserowConfigRow = {
  id: number;
  "body.auth.institutionId"?: unknown;
  "body.tenant.companyName"?: string;
  [key: string]: unknown;
};

export const listInstitutions = async (): Promise<
  Array<{ institutionId: number; companyName: string }>
> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select({
          instId: configTable.bodyAuthInstitutionId,
          companyName: configTable.bodyTenantCompanyName,
        })
        .from(configTable);
  
      const seen = new Map<number, string>();
      for (const row of rows) {
        const instId = Number(row.instId);
        if (!Number.isFinite(instId) || instId <= 0) continue;
        if (seen.has(instId)) continue;
        const name =
          typeof row.companyName === "string" && row.companyName.trim()
            ? row.companyName.trim()
            : `Instituição ${instId}`;
        seen.set(instId, name);
      }
  
      return Array.from(seen.entries())
        .map(([institutionId, companyName]) => ({ institutionId, companyName }))
        .sort((a, b) => a.institutionId - b.institutionId);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const rows = await fetchTableRows<BaserowConfigRow>(
    CONFIG_TABLE_ID,
    new URLSearchParams({ user_field_names: "true", size: "200" }),
  );

  const seen = new Map<number, string>();
  for (const row of rows) {
    const instId = Number(row["body.auth.institutionId"]);
    if (!Number.isFinite(instId) || instId <= 0) continue;
    if (seen.has(instId)) continue;
    const name =
      typeof row["body.tenant.companyName"] === "string" &&
      row["body.tenant.companyName"].trim()
        ? row["body.tenant.companyName"].trim()
        : `Instituição ${instId}`;
    seen.set(instId, name);
  }

  return Array.from(seen.entries())
    .map(([institutionId, companyName]) => ({ institutionId, companyName }))
    .sort((a, b) => a.institutionId - b.institutionId);
};

export type InstitutionFeature = {
  key: string;
  path: string;
  label: string;
  isEnabled: boolean;
  menuRowId?: number;
};

export const getInstitutionFeatures = async (
  institutionId: number,
): Promise<InstitutionFeature[]> => {
  const rows = await fetchMenuRowsForInstitution(institutionId);

  const rowByPath = new Map<string, MenuRow>();
  for (const row of rows) {
    if (row.path) {
      rowByPath.set(row.path as string, row);
    }
  }

  const missingFeatures: SystemFeature[] = [];
  const result: InstitutionFeature[] = [];

  for (const feature of SYSTEM_FEATURES) {
    const existing = rowByPath.get(feature.path);
    if (existing) {
      result.push({
        key: feature.key,
        path: feature.path,
        label: feature.label,
        isEnabled: isActiveValue(existing.is_active),
        menuRowId: existing.id,
      });
    } else {
      missingFeatures.push(feature);
    }
  }

  if (missingFeatures.length > 0) {
    // --- Drizzle branch (create missing menu rows) ---
    if (useDirectDb("permissions")) {
      const _ok = await tryDrizzle("permissions", async () => {
        const created = await Promise.all(
          missingFeatures.map((feature, index) =>
            db
              .insert(menuTable)
              .values({
                label: feature.label,
                path: feature.path,
                isActive: true,
                displayOrder: String(index + rows.length),
                institutionId: String(institutionId),
              })
              .returning(),
          ),
        );

        for (let i = 0; i < missingFeatures.length; i++) {
          const feature = missingFeatures[i];
          const row = created[i][0];
          result.push({
            key: feature.key,
            path: feature.path,
            label: feature.label,
            isEnabled: true,
            menuRowId: row.id,
          });
        }
      });
      if (_ok === undefined) {
        // Drizzle failed — Baserow fallback
        const created = await Promise.all(
          missingFeatures.map((feature, index) =>
            createRow<MenuRow>(TABLE_IDS.menus, {
              label: feature.label,
              path: feature.path,
              is_active: true,
              display_order: index + rows.length,
              [INSTITUTION_FIELD]: institutionId,
            }),
          ),
        );

        for (let i = 0; i < missingFeatures.length; i++) {
          const feature = missingFeatures[i];
          const row = created[i];
          result.push({
            key: feature.key,
            path: feature.path,
            label: feature.label,
            isEnabled: true,
            menuRowId: row.id,
          });
        }
      }
    } else {
      // --- Baserow fallback ---
      const created = await Promise.all(
        missingFeatures.map((feature, index) =>
          createRow<MenuRow>(TABLE_IDS.menus, {
            label: feature.label,
            path: feature.path,
            is_active: true,
            display_order: index + rows.length,
            [INSTITUTION_FIELD]: institutionId,
          }),
        ),
      );

      for (let i = 0; i < missingFeatures.length; i++) {
        const feature = missingFeatures[i];
        const row = created[i];
        result.push({
          key: feature.key,
          path: feature.path,
          label: feature.label,
          isEnabled: true,
          menuRowId: row.id,
        });
      }
    }
  }

  return result.sort(
    (a, b) =>
      SYSTEM_FEATURES.findIndex((f) => f.key === a.key) -
      SYSTEM_FEATURES.findIndex((f) => f.key === b.key),
  );
};

export const updateInstitutionFeatures = async ({
  institutionId,
  legacyUserId,
  targetInstitutionId,
  features,
}: {
  institutionId: number;
  legacyUserId: string;
  targetInstitutionId?: number;
  features: Record<string, boolean>;
}): Promise<void> => {
  await assertSysAdmin(institutionId, legacyUserId);
  const effectiveId = targetInstitutionId ?? institutionId;

  const currentFeatures = await getInstitutionFeatures(effectiveId);

  const updates: Array<{ rowId: number; isActive: boolean }> = [];
  for (const feature of currentFeatures) {
    const newValue = features[feature.key];
    if (newValue !== undefined && newValue !== feature.isEnabled && feature.menuRowId) {
      updates.push({ rowId: feature.menuRowId, isActive: newValue });
    }
  }

  if (updates.length > 0) {
    // --- Drizzle branch ---
    if (useDirectDb("permissions")) {
      const _ok = await tryDrizzle("permissions", async () => {
        await Promise.all(
          updates.map(({ rowId, isActive }) =>
            db
              .update(menuTable)
              .set({ isActive })
              .where(eq(menuTable.id, rowId)),
          ),
        );
      });
      if (_ok !== undefined) return;
    }
    // --- Baserow fallback ---
    const client = baserowClient();
    await Promise.all(
      updates.map(({ rowId, isActive }) =>
        client.patch(
          `/database/rows/table/${TABLE_IDS.menus}/${rowId}/?user_field_names=true`,
          { is_active: isActive },
        ),
      ),
    );
  }
};

// ---------------------------------------------------------------------------
// User Features (per-user feature toggles, table 250)
// ---------------------------------------------------------------------------

const isEnabledValue = (val: unknown): boolean => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true";
  return false;
};

export const fetchUserFeatures = async (
  userId: number,
  institutionId: number,
): Promise<UserFeatureRow[]> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db
        .select()
        .from(userFeaturesTable)
        .where(
          and(
            eq(userFeaturesTable.userId, String(userId)),
            eq(userFeaturesTable.institutionId, String(institutionId)),
          ),
        );
      return rows.map(mapUserFeatureRow);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
    "filter__user_id__equal": String(userId),
    "filter__institution_id__equal": String(institutionId),
  });
  return fetchTableRows<UserFeatureRow>(TABLE_IDS.userFeatures, params);
};

export const getUserEnabledFeatureKeys = async (
  userId: number,
  institutionId: number,
): Promise<Set<string>> => {
  const rows = await fetchUserFeatures(userId, institutionId);
  const enabled = new Set<string>();
  for (const row of rows) {
    if (isEnabledValue(row.is_enabled)) {
      enabled.add(row.feature_key);
    }
  }
  return enabled;
};

export const updateUserFeatures = async (
  userId: number,
  institutionId: number,
  features: Record<string, boolean>,
): Promise<void> => {
  const existing = await fetchUserFeatures(userId, institutionId);

  const existingByKey = new Map<string, UserFeatureRow>();
  for (const row of existing) {
    existingByKey.set(row.feature_key, row);
  }

  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _ok = await tryDrizzle("permissions", async () => {
      const ops: Promise<unknown>[] = [];
      for (const [key, enabled] of Object.entries(features)) {
        const row = existingByKey.get(key);
        if (row) {
          ops.push(
            db
              .update(userFeaturesTable)
              .set({ isEnabled: enabled })
              .where(eq(userFeaturesTable.id, row.id)),
          );
        } else {
          ops.push(
            db.insert(userFeaturesTable).values({
              userId: String(userId),
              institutionId: String(institutionId),
              featureKey: key,
              isEnabled: enabled,
            }),
          );
        }
      }
      await Promise.all(ops);
    });
    if (_ok !== undefined) return;
  }
  // --- Baserow fallback ---
  const client = baserowClient();
  const ops: Promise<unknown>[] = [];

  for (const [key, enabled] of Object.entries(features)) {
    const row = existingByKey.get(key);
    if (row) {
      // Update existing
      ops.push(
        client.patch(
          `/database/rows/table/${TABLE_IDS.userFeatures}/${row.id}/?user_field_names=true`,
          { is_enabled: enabled },
        ),
      );
    } else {
      // Create new
      ops.push(
        createRow(TABLE_IDS.userFeatures, {
          user_id: userId,
          institution_id: institutionId,
          feature_key: key,
          is_enabled: enabled,
        }),
      );
    }
  }

  await Promise.all(ops);
};

// ---------------------------------------------------------------------------
// User CRUD (institution-scoped)
// ---------------------------------------------------------------------------

const toUserPublic = (row: BaserowUserRow): UserPublicRow => {
  const rawInstId = row[INSTITUTION_FIELD];
  const instId = typeof rawInstId === "number" ? rawInstId : Number(rawInstId);
  return {
    id: row.id,
    name: (row.name ?? "").trim(),
    email: (row.email ?? "").trim(),
    phone: (row.phone ?? "").trim(),
    oab: (row.OAB ?? "").trim(),
    isActive: isActiveValue(row.is_active),
    isOfficeAdmin: row.is_office_admin === true,
    receivesCases: row.receives_cases === true || String(row.receives_cases) === "true",
    institutionId: Number.isFinite(instId) && instId > 0 ? instId : undefined,
  };
};

export const fetchInstitutionUsers = async (
  institutionId: number,
): Promise<UserPublicRow[]> => {
  const rows = await fetchInstitutionUsersRaw(institutionId);
  return rows.map(toUserPublic);
};

export const fetchAllUsers = async (): Promise<UserPublicRow[]> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db.select().from(usersTable);
      return rows.map(mapUserRow).map(toUserPublic);
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
  });
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  return rows.map(toUserPublic);
};

/**
 * Reseta is_office_admin para false em todos os usuários.
 * Necessário porque Baserow boolean default = true para rows existentes.
 */
export const resetAllOfficeAdminFlags = async (): Promise<number> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const result = await db
        .update(usersTable)
        .set({ isOfficeAdmin: false })
        .where(eq(usersTable.isOfficeAdmin, true))
        .returning({ id: usersTable.id });
      return result.length;
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
    "filter__is_office_admin__boolean": "true",
  });
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  const client = baserowClient();
  let count = 0;
  for (const row of rows) {
    await client.patch(
      `/database/rows/table/${TABLE_IDS.users}/${row.id}/?user_field_names=true`,
      { is_office_admin: false },
    );
    count++;
  }
  return count;
};

export const createInstitutionUser = async (
  institutionId: number,
  data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    oab?: string;
    isOfficeAdmin?: boolean;
  },
): Promise<UserPublicRow> => {
  const normalizedEmail = data.email.trim().toLowerCase();

  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      // Check duplicate
      const dup = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.email, normalizedEmail),
            eq(usersTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (dup.length > 0) {
        throw new Error("Já existe um usuário com este e-mail nesta instituição.");
      }
  
      const now = new Date();
      const inserted = await db
        .insert(usersTable)
        .values({
          institutionId: String(institutionId),
          name: data.name.trim(),
          email: normalizedEmail,
          password: data.password,
          isActive: true,
          isOfficeAdmin: data.isOfficeAdmin === true,
          receivesCases: false,
          phone: data.phone?.trim() ?? null,
          oab: data.oab?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
  
      const row = inserted[0];
      // Set legacy_user_id to row ID
      if (!row.legacyUserId) {
        const updated = await db
          .update(usersTable)
          .set({ legacyUserId: String(row.id) })
          .where(eq(usersTable.id, row.id))
          .returning();
        return toUserPublic(mapUserRow(updated[0]));
      }
  
      invalidateUsersCache(institutionId);
      return toUserPublic(mapUserRow(row));
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  // Check for duplicate email in this institution
  const checkParams = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  checkParams.append("filter__email__equal", normalizedEmail);
  withInstitutionFilter(checkParams, institutionId);
  const existing = await fetchTableRows<BaserowUserRow>(
    TABLE_IDS.users,
    checkParams,
  );
  if (existing.length > 0) {
    throw new Error("Já existe um usuário com este e-mail nesta instituição.");
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    [INSTITUTION_FIELD]: institutionId,
    name: data.name.trim(),
    email: normalizedEmail,
    password: data.password,
    is_active: true,
    is_office_admin: data.isOfficeAdmin === true,
    receives_cases: false,
    created_at: now,
    updated_at: now,
  };
  if (data.phone) payload.phone = data.phone.trim();
  if (data.oab) payload.OAB = data.oab.trim();

  const row = await createRow<BaserowUserRow>(TABLE_IDS.users, payload);

  // Set legacy_user_id to row ID so findUserByLegacy works after login
  if (!row.legacy_user_id) {
    const client = baserowClient();
    await client.patch(
      `/database/rows/table/${TABLE_IDS.users}/${row.id}/?user_field_names=true`,
      { legacy_user_id: String(row.id) },
    );
    row.legacy_user_id = String(row.id);
  }

  invalidateUsersCache(institutionId);
  return toUserPublic(row);
};

export const updateInstitutionUser = async (
  institutionId: number,
  userId: number,
  data: {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    oab?: string;
    isActive?: boolean;
    isOfficeAdmin?: boolean;
    receivesCases?: boolean;
  },
): Promise<UserPublicRow> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      // Verify the user belongs to this institution
      const check = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, userId),
            eq(usersTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (check.length === 0) {
        throw new Error("Usuário não encontrado nesta instituição.");
      }
  
      const setFields: Partial<typeof usersTable.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) setFields.name = data.name.trim();
      if (data.email !== undefined) {
        const normalizedEmail = data.email.trim().toLowerCase();
        // Check duplicate email (excluding self)
        const dups = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.email, normalizedEmail),
              eq(usersTable.institutionId, String(institutionId)),
            ),
          )
          .limit(1);
        if (dups.length > 0 && dups[0].id !== userId) {
          throw new Error("Já existe outro usuário com este e-mail nesta instituição.");
        }
        setFields.email = normalizedEmail;
      }
      if (data.password !== undefined) setFields.password = data.password;
      if (data.phone !== undefined) setFields.phone = data.phone.trim();
      if (data.oab !== undefined) setFields.oab = data.oab.trim();
      if (data.isActive !== undefined) setFields.isActive = data.isActive;
      if (data.isOfficeAdmin !== undefined) setFields.isOfficeAdmin = data.isOfficeAdmin;
      if (data.receivesCases !== undefined) setFields.receivesCases = data.receivesCases;
  
      const updated = await db
        .update(usersTable)
        .set(setFields)
        .where(eq(usersTable.id, userId))
        .returning();
  
      invalidateUsersCache(institutionId);
      return toUserPublic(mapUserRow(updated[0]));
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  // Verify the user belongs to this institution
  const checkParams = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  checkParams.append("filter__id__equal", String(userId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, checkParams);
  if (rows.length === 0) {
    throw new Error("Usuário não encontrado nesta instituição.");
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.email !== undefined) {
    const normalizedEmail = data.email.trim().toLowerCase();
    // Check duplicate email (excluding self)
    const dupParams = new URLSearchParams({
      user_field_names: "true",
      size: "1",
    });
    dupParams.append("filter__email__equal", normalizedEmail);
    withInstitutionFilter(dupParams, institutionId);
    const dups = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, dupParams);
    if (dups.length > 0 && dups[0].id !== userId) {
      throw new Error("Já existe outro usuário com este e-mail nesta instituição.");
    }
    payload.email = normalizedEmail;
  }
  if (data.password !== undefined) payload.password = data.password;
  if (data.phone !== undefined) payload.phone = data.phone.trim();
  if (data.oab !== undefined) payload.OAB = data.oab.trim();
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.isOfficeAdmin !== undefined) payload.is_office_admin = data.isOfficeAdmin;
  if (data.receivesCases !== undefined) payload.receives_cases = data.receivesCases;

  const client = baserowClient();
  const response = await client.patch<BaserowUserRow>(
    `/database/rows/table/${TABLE_IDS.users}/${userId}/?user_field_names=true`,
    payload,
  );
  invalidateUsersCache(institutionId);
  return toUserPublic(response.data);
};

export const deleteInstitutionUser = async (
  institutionId: number,
  userId: number,
): Promise<void> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _ok = await tryDrizzle("permissions", async () => {
      const check = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, userId),
            eq(usersTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (check.length === 0) {
        throw new Error("Usuário não encontrado nesta instituição.");
      }
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      invalidateUsersCache(institutionId);
    });
    if (_ok !== undefined) return;
  }
  // --- Baserow fallback ---
  // Verify the user belongs to this institution
  const checkParams = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  checkParams.append("filter__id__equal", String(userId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, checkParams);
  if (rows.length === 0) {
    throw new Error("Usuário não encontrado nesta instituição.");
  }
  await deleteRow(TABLE_IDS.users, userId);
  invalidateUsersCache(institutionId);
};

export const authenticateViaUsersTable = async (
  email: string,
  password: string,
): Promise<{
  institutionId: number;
  userId: number;
  name: string;
  email: string;
} | null> => {
  const normalizedEmail = email.trim().toLowerCase();

  // --- Drizzle branch (prepared statement) ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await prepared.getUsersByEmail.execute({
        email: normalizedEmail,
      });
  
      for (const row of rows) {
        if (!row.password) continue;
        if (row.password !== password) continue;
        const instId = row.institutionId ? Number(row.institutionId) : 0;
        if (!Number.isFinite(instId) || instId <= 0) continue;
        if (row.isActive === false) continue;
  
        return {
          institutionId: instId,
          userId: row.id,
          name: (row.name ?? "").trim(),
          email: (row.email ?? normalizedEmail).trim(),
        };
      }
      return null;
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "10",
  });
  params.append("filter__email__equal", normalizedEmail);

  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  if (rows.length === 0) return null;

  for (const row of rows) {
    const storedPassword = row.password;
    if (!storedPassword) continue;
    if (storedPassword !== password) continue;

    const rawInstId = row[INSTITUTION_FIELD];
    const instId =
      typeof rawInstId === "number"
        ? rawInstId
        : Number(rawInstId);
    if (!Number.isFinite(instId) || instId <= 0) continue;

    if (row.is_active === false) continue;

    return {
      institutionId: instId,
      userId: row.id,
      name: (row.name ?? "").trim(),
      email: (row.email ?? normalizedEmail).trim(),
    };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Backfill: set legacy_user_id = String(row.id) for users missing it
// ---------------------------------------------------------------------------

export const backfillLegacyUserIds = async (): Promise<{
  updated: number;
  skipped: number;
}> => {
  // --- Drizzle branch ---
  if (useDirectDb("permissions")) {
    const _dr = await tryDrizzle("permissions", async () => {
      const rows = await db.select().from(usersTable);
      let updated = 0;
      let skipped = 0;
  
      for (const row of rows) {
        const current = (row.legacyUserId ?? "").trim();
        if (current) {
          skipped++;
          continue;
        }
        await db
          .update(usersTable)
          .set({ legacyUserId: String(row.id) })
          .where(eq(usersTable.id, row.id));
        updated++;
      }
  
      invalidateUsersCache();
      return { updated, skipped };
    });
    if (_dr !== undefined) return _dr;
  }
  // --- Baserow fallback ---
  const client = baserowClient();
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
  });

  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const current = (row.legacy_user_id ?? "").trim();
    if (current) {
      skipped++;
      continue;
    }

    await client.patch(
      `/database/rows/table/${TABLE_IDS.users}/${row.id}/?user_field_names=true`,
      { legacy_user_id: String(row.id) },
    );
    updated++;
  }

  invalidateUsersCache();
  return { updated, skipped };
};

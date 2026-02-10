import axios from "axios";

import {
  SYSTEM_FEATURES,
  ALL_FEATURE_PATHS,
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

const DEFAULT_TABLES = {
  users: 236,
  roles: 237,
  menus: 238,
  permissions: 239,
  rolePermissions: 240,
  userRoles: 241,
  audit: 242,
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
  const searchParams = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  searchParams.append("filter__legacy_user_id__equal", params.legacyUserId);
  withInstitutionFilter(searchParams, params.institutionId);

  const rows = await fetchTableRows<BaserowUserRow>(
    TABLE_IDS.users,
    searchParams,
  );
  return rows[0] ?? null;
};

export const syncUserRecord = async (
  params: SyncUserParams,
): Promise<SyncUserResult> => {
  const existing = await findExistingUser(params);
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
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(params, institutionId);
  return fetchTableRows<UserRoleRow>(TABLE_IDS.userRoles, params);
};

const fetchRolePermissionRows = async (institutionId: number) => {
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  withInstitutionFilter(params, institutionId);
  return fetchTableRows<RolePermissionRow>(TABLE_IDS.rolePermissions, params);
};

const loadCurrentUserContext = async (
  institutionId: number,
  legacyUserId: string,
) => {
  const user = await findUserByLegacy(institutionId, legacyUserId);
  if (!user) {
    throw new Error("Usuário não encontrado na base de permissões");
  }

  const [roles, userRoleRows] = await Promise.all([
    fetchTableRows<RoleRow>(TABLE_IDS.roles, (() => {
      const p = new URLSearchParams({ user_field_names: "true", size: "200" });
      withInstitutionFilter(p, institutionId);
      return p;
    })()),
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
      fetchTableRows<RoleRow>(TABLE_IDS.roles, (() => {
        const p = new URLSearchParams({ user_field_names: "true", size: "200" });
        withInstitutionFilter(p, effectiveInstitutionId);
        return p;
      })()),
      fetchUserRoleRows(effectiveInstitutionId),
    ]);
    roles = r;
    userRoleRows = ur;
  }

  const [permissions, menus, rolePermissionRows, users] = await Promise.all([
    fetchTableRows<PermissionRow>(TABLE_IDS.permissions, (() => {
      const p = new URLSearchParams({ user_field_names: "true", size: "200" });
      withInstitutionFilter(p, effectiveInstitutionId);
      return p;
    })()),
    fetchTableRows<MenuRow>(TABLE_IDS.menus, (() => {
      const p = new URLSearchParams({ user_field_names: "true", size: "200" });
      withInstitutionFilter(p, effectiveInstitutionId);
      return p;
    })()),
    fetchRolePermissionRows(effectiveInstitutionId),
    fetchTableRows<BaserowUserRow>(TABLE_IDS.users, (() => {
      const p = new URLSearchParams({ user_field_names: "true", size: "200" });
      withInstitutionFilter(p, effectiveInstitutionId);
      return p;
    })()),
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

export const fetchPermissionsStatus = async (
  institutionId: number,
  legacyUserId: string,
) => {
  const globalAdmin = isGlobalAdmin(institutionId);

  if (globalAdmin) {
    return {
      isSysAdmin: true,
      isGlobalAdmin: true,
      userId: 0,
      enabledPages: ALL_FEATURE_PATHS,
    };
  }

  // Buscar páginas habilitadas mesmo que o usuário não exista na tabela Users
  let isSysAdmin = false;
  let userId = 0;

  const enabledPages = await getEnabledPagesForInstitution(institutionId);

  try {
    const ctx = await loadCurrentUserContext(institutionId, legacyUserId);
    isSysAdmin = ctx.isSysAdmin;
    userId = ctx.user.id;
  } catch (error) {
    // Usuário pode não estar na tabela Users ainda (primeiro login via webhook).
    // Continuar com enabledPages mesmo assim.
    console.warn(
      "[fetchPermissionsStatus] user context failed, using enabledPages only:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    isSysAdmin,
    isGlobalAdmin: false,
    userId,
    enabledPages: isSysAdmin ? ALL_FEATURE_PATHS : enabledPages,
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
    institutionId: Number.isFinite(instId) && instId > 0 ? instId : undefined,
  };
};

export const fetchInstitutionUsers = async (
  institutionId: number,
): Promise<UserPublicRow[]> => {
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
  });
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  return rows.map(toUserPublic);
};

export const fetchAllUsers = async (): Promise<UserPublicRow[]> => {
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
  });
  const rows = await fetchTableRows<BaserowUserRow>(TABLE_IDS.users, params);
  return rows.map(toUserPublic);
};

export const createInstitutionUser = async (
  institutionId: number,
  data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    oab?: string;
  },
): Promise<UserPublicRow> => {
  const normalizedEmail = data.email.trim().toLowerCase();

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
    created_at: now,
    updated_at: now,
  };
  if (data.phone) payload.phone = data.phone.trim();
  if (data.oab) payload.OAB = data.oab.trim();

  const row = await createRow<BaserowUserRow>(TABLE_IDS.users, payload);
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
  },
): Promise<UserPublicRow> => {
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

  const client = baserowClient();
  const response = await client.patch<BaserowUserRow>(
    `/database/rows/table/${TABLE_IDS.users}/${userId}/?user_field_names=true`,
    payload,
  );
  return toUserPublic(response.data);
};

export const deleteInstitutionUser = async (
  institutionId: number,
  userId: number,
): Promise<void> => {
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

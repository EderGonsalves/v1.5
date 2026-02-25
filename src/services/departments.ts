import axios from "axios";
import { eq, and, sql, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { prepared } from "@/lib/db/prepared";
import { departments as deptTable } from "@/lib/db/schema/departments";
import { userDepartments as udTable } from "@/lib/db/schema/userDepartments";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";

// ---------------------------------------------------------------------------
// Baserow config (fallback)
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const INSTITUTION_FIELD = "institution_id";
const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const DEFAULT_TABLES = {
  departments: 247,
  userDepartments: 248,
};

const TABLE_IDS = {
  departments:
    Number(
      process.env.BASEROW_DEPARTMENTS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_DEPARTMENTS_TABLE_ID ??
        DEFAULT_TABLES.departments,
    ) || DEFAULT_TABLES.departments,
  userDepartments:
    Number(
      process.env.BASEROW_USER_DEPARTMENTS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_USER_DEPARTMENTS_TABLE_ID ??
        DEFAULT_TABLES.userDepartments,
    ) || DEFAULT_TABLES.userDepartments,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BaserowListResponse<T> = {
  results?: T[];
};

export type BaserowDepartmentRow = {
  id: number;
  name?: string;
  description?: string;
  is_active?: boolean | string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type DepartmentPublicRow = {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  institutionId?: number;
};

export type BaserowUserDepartmentRow = {
  id: number;
  user_id?: number;
  department_id?: number;
  is_primary?: boolean | string;
  created_at?: string;
  [key: string]: unknown;
};

export type UserDepartmentPublicRow = {
  id: number;
  userId: number;
  departmentId: number;
  isPrimary: boolean;
  institutionId?: number;
};

// ---------------------------------------------------------------------------
// Baserow client utilities (fallback)
// ---------------------------------------------------------------------------

const ensureEnv = () => {
  if (!BASEROW_API_URL) throw new Error("BASEROW_API_URL não configurado");
  if (!BASEROW_API_KEY) throw new Error("BASEROW_API_KEY não configurado");
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
  searchParams.set("size", "200");
  const url = `/database/rows/table/${tableId}/?${searchParams.toString()}`;
  const response = await client.get<BaserowListResponse<T>>(url);
  return response.data.results ?? [];
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

const deleteRow = async (tableId: number, rowId: number) => {
  const client = baserowClient();
  await client.delete(`/database/rows/table/${tableId}/${rowId}/`);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isActiveValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return lower !== "false" && lower !== "0" && lower !== "";
  }
  return value !== false && value !== 0 && value !== null && value !== undefined;
};

export const isGlobalAdmin = (institutionId: number) =>
  institutionId === GLOBAL_ADMIN_INSTITUTION_ID;

// ---------------------------------------------------------------------------
// Drizzle mappers
// ---------------------------------------------------------------------------

function mapDeptRow(r: typeof deptTable.$inferSelect): DepartmentPublicRow {
  return {
    id: r.id,
    name: (r.name ?? "").trim(),
    description: (r.description ?? "").trim(),
    isActive: r.isActive === true,
    institutionId: r.institutionId ? Number(r.institutionId) : undefined,
  };
}

function mapUdRow(r: typeof udTable.$inferSelect): UserDepartmentPublicRow {
  return {
    id: r.id,
    userId: Number(r.userId) || 0,
    departmentId: Number(r.departmentId) || 0,
    isPrimary: r.isPrimary === true,
    institutionId: r.institutionId ? Number(r.institutionId) : undefined,
  };
}

// Baserow transformers (fallback)
const toDepartmentPublic = (row: BaserowDepartmentRow): DepartmentPublicRow => {
  const rawInstId = row[INSTITUTION_FIELD];
  const instId = typeof rawInstId === "number" ? rawInstId : Number(rawInstId);
  return {
    id: row.id,
    name: (row.name ?? "").trim(),
    description: (row.description ?? "").trim(),
    isActive: isActiveValue(row.is_active),
    institutionId: Number.isFinite(instId) && instId > 0 ? instId : undefined,
  };
};

const toUserDepartmentPublic = (
  row: BaserowUserDepartmentRow,
): UserDepartmentPublicRow => {
  const rawInstId = row[INSTITUTION_FIELD];
  const instId = typeof rawInstId === "number" ? rawInstId : Number(rawInstId);
  return {
    id: row.id,
    userId: Number(row.user_id) || 0,
    departmentId: Number(row.department_id) || 0,
    isPrimary: isActiveValue(row.is_primary),
    institutionId: Number.isFinite(instId) && instId > 0 ? instId : undefined,
  };
};

// ---------------------------------------------------------------------------
// Server-side cache (only for Baserow fallback — not needed with direct DB)
// ---------------------------------------------------------------------------

const deptCacheMap = new Map<number, { rows: DepartmentPublicRow[]; ts: number }>();
const userDeptCacheMap = new Map<string, { ids: number[]; ts: number }>();
const DEPT_CACHE_TTL = 600_000;

export const invalidateDepartmentsCache = (institutionId?: number): void => {
  if (institutionId !== undefined) {
    deptCacheMap.delete(institutionId);
    for (const key of userDeptCacheMap.keys()) {
      if (key.endsWith(`:${institutionId}`)) {
        userDeptCacheMap.delete(key);
      }
    }
  } else {
    deptCacheMap.clear();
    userDeptCacheMap.clear();
  }
};

// ---------------------------------------------------------------------------
// Department CRUD
// ---------------------------------------------------------------------------

export const fetchInstitutionDepartments = async (
  institutionId: number,
): Promise<DepartmentPublicRow[]> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db
        .select()
        .from(deptTable)
        .where(
          and(
            eq(deptTable.institutionId, String(institutionId)),
            eq(deptTable.isActive, true),
          ),
        );
      return rows.map(mapDeptRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback with cache
  const cached = deptCacheMap.get(institutionId);
  if (cached && Date.now() - cached.ts < DEPT_CACHE_TTL) {
    return cached.rows;
  }
  const params = new URLSearchParams();
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments, params);
  const result = rows.filter((r) => isActiveValue(r.is_active)).map(toDepartmentPublic);
  deptCacheMap.set(institutionId, { rows: result, ts: Date.now() });
  return result;
};

export const fetchAllDepartments = async (): Promise<DepartmentPublicRow[]> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db
        .select()
        .from(deptTable)
        .where(eq(deptTable.isActive, true));
      return rows.map(mapDeptRow);
    });
    if (_dr !== undefined) return _dr;
  }

  const rows = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments);
  return rows.filter((r) => isActiveValue(r.is_active)).map(toDepartmentPublic);
};

export const fetchDepartmentById = async (
  departmentId: number,
): Promise<DepartmentPublicRow | null> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const [row] = await db
        .select()
        .from(deptTable)
        .where(eq(deptTable.id, departmentId))
        .limit(1);
      return row ? mapDeptRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  try {
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`;
    const response = await client.get<BaserowDepartmentRow>(url);
    return toDepartmentPublic(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
};

export const createInstitutionDepartment = async (
  institutionId: number,
  data: { name: string; description?: string },
): Promise<DepartmentPublicRow> => {
  const normalizedName = data.name.trim();
  const now = new Date().toISOString();

  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      // Check duplicate
      const existing = await db
        .select({ id: deptTable.id })
        .from(deptTable)
        .where(
          and(
            eq(deptTable.institutionId, String(institutionId)),
            eq(deptTable.name, normalizedName),
            eq(deptTable.isActive, true),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error("Já existe um departamento com este nome nesta instituição.");
      }
  
      const [created] = await db
        .insert(deptTable)
        .values({
          institutionId: String(institutionId),
          name: normalizedName,
          description: data.description?.trim() ?? "",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapDeptRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__name__equal", normalizedName);
  withInstitutionFilter(checkParams, institutionId);
  const existingRows = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments, checkParams);
  if (existingRows.some((r) => isActiveValue(r.is_active))) {
    throw new Error("Já existe um departamento com este nome nesta instituição.");
  }

  const payload: Record<string, unknown> = {
    [INSTITUTION_FIELD]: institutionId,
    name: normalizedName,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  if (data.description) payload.description = data.description.trim();
  const row = await createRow<BaserowDepartmentRow>(TABLE_IDS.departments, payload);
  invalidateDepartmentsCache(institutionId);
  return toDepartmentPublic(row);
};

export const updateInstitutionDepartment = async (
  institutionId: number,
  departmentId: number,
  data: { name?: string; description?: string; isActive?: boolean },
): Promise<DepartmentPublicRow> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      // Verify ownership
      const [exists] = await db
        .select({ id: deptTable.id })
        .from(deptTable)
        .where(
          and(
            eq(deptTable.id, departmentId),
            eq(deptTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (!exists) throw new Error("Departamento não encontrado nesta instituição.");
  
      const setValues: Partial<typeof deptTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
  
      if (data.name !== undefined) {
        const normalizedName = data.name.trim();
        // Check duplicate excluding self
        const dups = await db
          .select({ id: deptTable.id })
          .from(deptTable)
          .where(
            and(
              eq(deptTable.institutionId, String(institutionId)),
              eq(deptTable.name, normalizedName),
              eq(deptTable.isActive, true),
              ne(deptTable.id, departmentId),
            ),
          )
          .limit(1);
        if (dups.length > 0) {
          throw new Error("Já existe outro departamento com este nome nesta instituição.");
        }
        setValues.name = normalizedName;
      }
      if (data.description !== undefined) setValues.description = data.description.trim();
      if (data.isActive !== undefined) setValues.isActive = data.isActive;
  
      const [updated] = await db
        .update(deptTable)
        .set(setValues)
        .where(eq(deptTable.id, departmentId))
        .returning();
      return mapDeptRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(departmentId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments, checkParams);
  if (rows.length === 0) throw new Error("Departamento não encontrado nesta instituição.");

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) {
    const normalizedName = data.name.trim();
    const dupParams = new URLSearchParams();
    dupParams.append("filter__name__equal", normalizedName);
    withInstitutionFilter(dupParams, institutionId);
    const dups = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments, dupParams);
    if (dups.some((r) => r.id !== departmentId && isActiveValue(r.is_active))) {
      throw new Error("Já existe outro departamento com este nome nesta instituição.");
    }
    payload.name = normalizedName;
  }
  if (data.description !== undefined) payload.description = data.description.trim();
  if (data.isActive !== undefined) payload.is_active = data.isActive;

  const client = baserowClient();
  const response = await client.patch<BaserowDepartmentRow>(
    `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`,
    payload,
  );
  invalidateDepartmentsCache(institutionId);
  return toDepartmentPublic(response.data);
};

export const deleteInstitutionDepartment = async (
  institutionId: number,
  departmentId: number,
): Promise<void> => {
  if (useDirectDb("departments")) {
    const _ok = await tryDrizzle(async () => {
      const [exists] = await db
        .select({ id: deptTable.id })
        .from(deptTable)
        .where(
          and(
            eq(deptTable.id, departmentId),
            eq(deptTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (!exists) throw new Error("Departamento não encontrado nesta instituição.");
  
      await db
        .update(deptTable)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(deptTable.id, departmentId));
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(departmentId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(TABLE_IDS.departments, checkParams);
  if (rows.length === 0) throw new Error("Departamento não encontrado nesta instituição.");

  const client = baserowClient();
  await client.patch(
    `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`,
    { is_active: false, updated_at: new Date().toISOString() },
  );
  invalidateDepartmentsCache(institutionId);
};

// ---------------------------------------------------------------------------
// User-Department junction
// ---------------------------------------------------------------------------

export const fetchAllUserDepartments = async (
  institutionId: number,
): Promise<UserDepartmentPublicRow[]> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db
        .select()
        .from(udTable)
        .where(eq(udTable.institutionId, String(institutionId)));
      return rows.map(mapUdRow);
    });
    if (_dr !== undefined) return _dr;
  }

  const params = new URLSearchParams();
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, params);
  return rows.map(toUserDepartmentPublic);
};

export const fetchDepartmentUserIds = async (
  departmentId: number,
): Promise<number[]> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await prepared.getUsersByDepartment.execute({
        departmentId: String(departmentId),
      });
      return rows.map((r) => Number(r.userId)).filter((id) => id > 0);
    });
    if (_dr !== undefined) return _dr;
  }

  const params = new URLSearchParams();
  params.append("filter__department_id__equal", String(departmentId));
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, params);
  return rows.map((r) => Number(r.user_id)).filter((id) => id > 0);
};

export const getUserDepartmentIds = async (
  userId: number,
  institutionId: number,
): Promise<number[]> => {
  if (useDirectDb("departments")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await prepared.getDeptsByUserAndInstitution.execute({
        userId: String(userId),
        institutionId: String(institutionId),
      });
      return rows.map((r) => Number(r.departmentId)).filter((id) => id > 0);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback with cache
  const cacheKey = `${userId}:${institutionId}`;
  const cached = userDeptCacheMap.get(cacheKey);
  if (cached && Date.now() - cached.ts < DEPT_CACHE_TTL) {
    return cached.ids;
  }
  const params = new URLSearchParams();
  params.append("filter__user_id__equal", String(userId));
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, params);
  const ids = rows.map((r) => Number(r.department_id)).filter((id) => id > 0);
  userDeptCacheMap.set(cacheKey, { ids, ts: Date.now() });
  return ids;
};

export const setUserDepartments = async (
  userId: number,
  institutionId: number,
  departmentIds: number[],
  primaryDepartmentId?: number,
): Promise<void> => {
  if (useDirectDb("departments")) {
    const _ok = await tryDrizzle(async () => {
      // Fetch existing
      const existing = await db
        .select()
        .from(udTable)
        .where(
          and(
            eq(udTable.userId, String(userId)),
            eq(udTable.institutionId, String(institutionId)),
          ),
        );
  
      const existingDeptIds = new Set(existing.map((r) => Number(r.departmentId)).filter((id) => id > 0));
      const targetDeptIds = new Set(departmentIds);
  
      // Delete removed
      const toDelete = existing.filter((r) => !targetDeptIds.has(Number(r.departmentId)));
      for (const row of toDelete) {
        await db.delete(udTable).where(eq(udTable.id, row.id));
      }
  
      // Create new
      const toCreate = departmentIds.filter((id) => !existingDeptIds.has(id));
      for (const deptId of toCreate) {
        await db.insert(udTable).values({
          institutionId: String(institutionId),
          userId: String(userId),
          departmentId: String(deptId),
          isPrimary: primaryDepartmentId === deptId,
        });
      }
  
      // Update is_primary on existing kept rows
      if (primaryDepartmentId !== undefined) {
        const remaining = existing.filter((r) => targetDeptIds.has(Number(r.departmentId)));
        for (const row of remaining) {
          const shouldBePrimary = Number(row.departmentId) === primaryDepartmentId;
          if ((row.isPrimary === true) !== shouldBePrimary) {
            await db.update(udTable).set({ isPrimary: shouldBePrimary }).where(eq(udTable.id, row.id));
          }
        }
      }
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const params = new URLSearchParams();
  params.append("filter__user_id__equal", String(userId));
  withInstitutionFilter(params, institutionId);
  const existing = await fetchTableRows<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, params);

  const existingDeptIds = new Set(existing.map((r) => Number(r.department_id)).filter((id) => id > 0));
  const targetDeptIds = new Set(departmentIds);

  const toDelete = existing.filter((r) => !targetDeptIds.has(Number(r.department_id)));
  for (const row of toDelete) {
    await deleteRow(TABLE_IDS.userDepartments, row.id);
  }

  const toCreate = departmentIds.filter((id) => !existingDeptIds.has(id));
  for (const deptId of toCreate) {
    await createRow<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, {
      [INSTITUTION_FIELD]: institutionId,
      user_id: userId,
      department_id: deptId,
      is_primary: primaryDepartmentId === deptId,
      created_at: new Date().toISOString(),
    });
  }

  if (primaryDepartmentId !== undefined) {
    const client = baserowClient();
    const remaining = existing.filter((r) => targetDeptIds.has(Number(r.department_id)));
    for (const row of remaining) {
      const shouldBePrimary = Number(row.department_id) === primaryDepartmentId;
      if (isActiveValue(row.is_primary) !== shouldBePrimary) {
        await client.patch(
          `/database/rows/table/${TABLE_IDS.userDepartments}/${row.id}/?user_field_names=true`,
          { is_primary: shouldBePrimary },
        );
      }
    }
  }

  invalidateDepartmentsCache(institutionId);
};

export const setDepartmentUsers = async (
  departmentId: number,
  institutionId: number,
  userIds: number[],
): Promise<void> => {
  if (useDirectDb("departments")) {
    const _ok = await tryDrizzle(async () => {
      const existing = await db
        .select()
        .from(udTable)
        .where(
          and(
            eq(udTable.departmentId, String(departmentId)),
            eq(udTable.institutionId, String(institutionId)),
          ),
        );
  
      const existingUserIds = new Set(existing.map((r) => Number(r.userId)).filter((id) => id > 0));
      const targetUserIds = new Set(userIds);
  
      const toDelete = existing.filter((r) => !targetUserIds.has(Number(r.userId)));
      for (const row of toDelete) {
        await db.delete(udTable).where(eq(udTable.id, row.id));
      }
  
      const toCreate = userIds.filter((id) => !existingUserIds.has(id));
      for (const uid of toCreate) {
        await db.insert(udTable).values({
          institutionId: String(institutionId),
          userId: String(uid),
          departmentId: String(departmentId),
          isPrimary: false,
        });
      }
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const params = new URLSearchParams();
  params.append("filter__department_id__equal", String(departmentId));
  withInstitutionFilter(params, institutionId);
  const existing = await fetchTableRows<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, params);

  const existingUserIds = new Set(existing.map((r) => Number(r.user_id)).filter((id) => id > 0));
  const targetUserIds = new Set(userIds);

  const toDelete = existing.filter((r) => !targetUserIds.has(Number(r.user_id)));
  for (const row of toDelete) {
    await deleteRow(TABLE_IDS.userDepartments, row.id);
  }

  const toCreate = userIds.filter((id) => !existingUserIds.has(id));
  for (const uid of toCreate) {
    await createRow<BaserowUserDepartmentRow>(TABLE_IDS.userDepartments, {
      [INSTITUTION_FIELD]: institutionId,
      user_id: uid,
      department_id: departmentId,
      is_primary: false,
      created_at: new Date().toISOString(),
    });
  }

  invalidateDepartmentsCache(institutionId);
};

// ---------------------------------------------------------------------------
// Seed defaults
// ---------------------------------------------------------------------------

const DEFAULT_DEPARTMENTS = [
  { name: "Jurídico", description: "Departamento jurídico" },
  { name: "Financeiro", description: "Departamento financeiro" },
  { name: "Comercial", description: "Departamento comercial" },
  { name: "Suporte Técnico", description: "Suporte técnico e atendimento" },
];

export const seedDefaultDepartments = async (
  institutionId: number,
): Promise<{ created: DepartmentPublicRow[]; existing: number }> => {
  const current = await fetchInstitutionDepartments(institutionId);
  const existingNames = new Set(
    current.map((d) => d.name.toLowerCase().trim()),
  );

  const created: DepartmentPublicRow[] = [];
  for (const dept of DEFAULT_DEPARTMENTS) {
    if (!existingNames.has(dept.name.toLowerCase().trim())) {
      const row = await createInstitutionDepartment(institutionId, dept);
      created.push(row);
    }
  }

  return { created, existing: current.length };
};

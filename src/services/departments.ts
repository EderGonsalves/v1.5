import axios from "axios";

// ---------------------------------------------------------------------------
// Baserow config
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
// Baserow client utilities (same pattern as permissions.ts)
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
// Transformers
// ---------------------------------------------------------------------------

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
// Department CRUD
// ---------------------------------------------------------------------------

export const fetchInstitutionDepartments = async (
  institutionId: number,
): Promise<DepartmentPublicRow[]> => {
  const params = new URLSearchParams();
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(
    TABLE_IDS.departments,
    params,
  );
  return rows.filter((r) => isActiveValue(r.is_active)).map(toDepartmentPublic);
};

export const fetchAllDepartments = async (): Promise<DepartmentPublicRow[]> => {
  const rows = await fetchTableRows<BaserowDepartmentRow>(
    TABLE_IDS.departments,
  );
  return rows.filter((r) => isActiveValue(r.is_active)).map(toDepartmentPublic);
};

export const fetchDepartmentById = async (
  departmentId: number,
): Promise<DepartmentPublicRow | null> => {
  try {
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`;
    const response = await client.get<BaserowDepartmentRow>(url);
    return toDepartmentPublic(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const createInstitutionDepartment = async (
  institutionId: number,
  data: { name: string; description?: string },
): Promise<DepartmentPublicRow> => {
  const normalizedName = data.name.trim();

  // Check duplicate name in this institution
  const checkParams = new URLSearchParams();
  checkParams.append("filter__name__equal", normalizedName);
  withInstitutionFilter(checkParams, institutionId);
  const existing = await fetchTableRows<BaserowDepartmentRow>(
    TABLE_IDS.departments,
    checkParams,
  );
  if (existing.some((r) => isActiveValue(r.is_active))) {
    throw new Error(
      "Já existe um departamento com este nome nesta instituição.",
    );
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    [INSTITUTION_FIELD]: institutionId,
    name: normalizedName,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  if (data.description) payload.description = data.description.trim();

  const row = await createRow<BaserowDepartmentRow>(
    TABLE_IDS.departments,
    payload,
  );
  return toDepartmentPublic(row);
};

export const updateInstitutionDepartment = async (
  institutionId: number,
  departmentId: number,
  data: { name?: string; description?: string; isActive?: boolean },
): Promise<DepartmentPublicRow> => {
  // Verify ownership
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(departmentId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(
    TABLE_IDS.departments,
    checkParams,
  );
  if (rows.length === 0) {
    throw new Error("Departamento não encontrado nesta instituição.");
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) {
    const normalizedName = data.name.trim();
    // Check duplicate (excluding self)
    const dupParams = new URLSearchParams();
    dupParams.append("filter__name__equal", normalizedName);
    withInstitutionFilter(dupParams, institutionId);
    const dups = await fetchTableRows<BaserowDepartmentRow>(
      TABLE_IDS.departments,
      dupParams,
    );
    if (dups.some((r) => r.id !== departmentId && isActiveValue(r.is_active))) {
      throw new Error(
        "Já existe outro departamento com este nome nesta instituição.",
      );
    }
    payload.name = normalizedName;
  }
  if (data.description !== undefined)
    payload.description = data.description.trim();
  if (data.isActive !== undefined) payload.is_active = data.isActive;

  const client = baserowClient();
  const response = await client.patch<BaserowDepartmentRow>(
    `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`,
    payload,
  );
  return toDepartmentPublic(response.data);
};

export const deleteInstitutionDepartment = async (
  institutionId: number,
  departmentId: number,
): Promise<void> => {
  // Verify ownership
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(departmentId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowDepartmentRow>(
    TABLE_IDS.departments,
    checkParams,
  );
  if (rows.length === 0) {
    throw new Error("Departamento não encontrado nesta instituição.");
  }

  // Soft-delete: set is_active=false
  const client = baserowClient();
  await client.patch(
    `/database/rows/table/${TABLE_IDS.departments}/${departmentId}/?user_field_names=true`,
    { is_active: false, updated_at: new Date().toISOString() },
  );
};

// ---------------------------------------------------------------------------
// User-Department junction
// ---------------------------------------------------------------------------

export const fetchAllUserDepartments = async (
  institutionId: number,
): Promise<UserDepartmentPublicRow[]> => {
  const params = new URLSearchParams();
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(
    TABLE_IDS.userDepartments,
    params,
  );
  return rows.map(toUserDepartmentPublic);
};

export const fetchDepartmentUserIds = async (
  departmentId: number,
): Promise<number[]> => {
  const params = new URLSearchParams();
  params.append("filter__department_id__equal", String(departmentId));
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(
    TABLE_IDS.userDepartments,
    params,
  );
  return rows.map((r) => Number(r.user_id)).filter((id) => id > 0);
};

export const getUserDepartmentIds = async (
  userId: number,
  institutionId: number,
): Promise<number[]> => {
  const params = new URLSearchParams();
  params.append("filter__user_id__equal", String(userId));
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowUserDepartmentRow>(
    TABLE_IDS.userDepartments,
    params,
  );
  return rows.map((r) => Number(r.department_id)).filter((id) => id > 0);
};

export const setUserDepartments = async (
  userId: number,
  institutionId: number,
  departmentIds: number[],
  primaryDepartmentId?: number,
): Promise<void> => {
  // Fetch existing assignments for this user
  const params = new URLSearchParams();
  params.append("filter__user_id__equal", String(userId));
  withInstitutionFilter(params, institutionId);
  const existing = await fetchTableRows<BaserowUserDepartmentRow>(
    TABLE_IDS.userDepartments,
    params,
  );

  const existingDeptIds = new Set(
    existing.map((r) => Number(r.department_id)).filter((id) => id > 0),
  );
  const targetDeptIds = new Set(departmentIds);

  // Delete removed assignments
  const toDelete = existing.filter(
    (r) => !targetDeptIds.has(Number(r.department_id)),
  );
  for (const row of toDelete) {
    await deleteRow(TABLE_IDS.userDepartments, row.id);
  }

  // Create new assignments
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

  // Update is_primary on existing rows if needed
  if (primaryDepartmentId !== undefined) {
    const client = baserowClient();
    const remaining = existing.filter((r) =>
      targetDeptIds.has(Number(r.department_id)),
    );
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
};

export const setDepartmentUsers = async (
  departmentId: number,
  institutionId: number,
  userIds: number[],
): Promise<void> => {
  // Fetch existing assignments for this department
  const params = new URLSearchParams();
  params.append("filter__department_id__equal", String(departmentId));
  withInstitutionFilter(params, institutionId);
  const existing = await fetchTableRows<BaserowUserDepartmentRow>(
    TABLE_IDS.userDepartments,
    params,
  );

  const existingUserIds = new Set(
    existing.map((r) => Number(r.user_id)).filter((id) => id > 0),
  );
  const targetUserIds = new Set(userIds);

  // Delete removed assignments
  const toDelete = existing.filter(
    (r) => !targetUserIds.has(Number(r.user_id)),
  );
  for (const row of toDelete) {
    await deleteRow(TABLE_IDS.userDepartments, row.id);
  }

  // Create new assignments
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

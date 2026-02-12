import type {
  DepartmentPublicRow,
} from "@/services/departments";
import type { UserPublicRow } from "@/services/permissions";

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error as string;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
};

// ---------------------------------------------------------------------------
// Department CRUD
// ---------------------------------------------------------------------------

export const fetchDepartmentsClient = async (
  institutionId?: number,
): Promise<DepartmentPublicRow[]> => {
  const params = institutionId ? `?institutionId=${institutionId}` : "";
  const data = await handleResponse<{ departments: DepartmentPublicRow[] }>(
    await fetch(`/api/v1/departments${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.departments;
};

export const createDepartmentClient = async (payload: {
  name: string;
  description?: string;
  institutionId?: number;
}): Promise<DepartmentPublicRow> => {
  const data = await handleResponse<{ department: DepartmentPublicRow }>(
    await fetch("/api/v1/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.department;
};

export const updateDepartmentClient = async (
  departmentId: number,
  payload: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<DepartmentPublicRow> => {
  const data = await handleResponse<{ department: DepartmentPublicRow }>(
    await fetch(`/api/v1/departments/${departmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.department;
};

export const deleteDepartmentClient = async (
  departmentId: number,
): Promise<void> => {
  await handleResponse<Record<string, never>>(
    await fetch(`/api/v1/departments/${departmentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

// ---------------------------------------------------------------------------
// Department users
// ---------------------------------------------------------------------------

export const fetchDepartmentUsersClient = async (
  departmentId: number,
): Promise<UserPublicRow[]> => {
  const data = await handleResponse<{ users: UserPublicRow[] }>(
    await fetch(`/api/v1/departments/${departmentId}/users`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.users;
};

export const setDepartmentUsersClient = async (
  departmentId: number,
  userIds: number[],
): Promise<void> => {
  await handleResponse<{ ok: boolean }>(
    await fetch(`/api/v1/departments/${departmentId}/users`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    }),
  );
};

// ---------------------------------------------------------------------------
// User departments
// ---------------------------------------------------------------------------

export const fetchUserDepartmentsClient = async (
  userId: number,
): Promise<{ departments: DepartmentPublicRow[]; departmentIds: number[] }> => {
  return handleResponse<{
    departments: DepartmentPublicRow[];
    departmentIds: number[];
  }>(
    await fetch(`/api/v1/users/${userId}/departments`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

export const setUserDepartmentsClient = async (
  userId: number,
  departmentIds: number[],
  primaryDepartmentId?: number,
): Promise<void> => {
  await handleResponse<{ ok: boolean }>(
    await fetch(`/api/v1/users/${userId}/departments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentIds, primaryDepartmentId }),
    }),
  );
};

// ---------------------------------------------------------------------------
// My departments (current user)
// ---------------------------------------------------------------------------

export type MyDepartmentsResponse = {
  departments: DepartmentPublicRow[];
  userDepartmentIds: number[];
  isGlobalAdmin: boolean;
  isOfficeAdmin?: boolean;
  userId?: number | null;
  userName?: string;
};

export const fetchMyDepartmentsClient =
  async (): Promise<MyDepartmentsResponse> => {
    return handleResponse<MyDepartmentsResponse>(
      await fetch("/api/v1/departments/my", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export const seedDepartmentsClient = async (
  institutionId?: number,
): Promise<{
  created: DepartmentPublicRow[];
  existingCount: number;
}> => {
  return handleResponse<{
    created: DepartmentPublicRow[];
    existingCount: number;
  }>(
    await fetch("/api/v1/departments/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(institutionId ? { institutionId } : {}),
    }),
  );
};

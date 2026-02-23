import type {
  InstitutionFeature,
  PermissionsOverview,
} from "@/services/permissions";

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

export const fetchPermissionsOverviewClient = async (
  institutionId?: number,
): Promise<PermissionsOverview> => {
  const params = institutionId ? `?institutionId=${institutionId}` : "";
  return handleResponse<PermissionsOverview>(
    await fetch(`/api/v1/permissions/overview${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

type PermissionsStatusResult = {
  isSysAdmin: boolean;
  isGlobalAdmin: boolean;
  isOfficeAdmin?: boolean;
  userId?: number;
  enabledPages?: string[];
  enabledActions?: string[];
};

let statusCache: { promise: Promise<PermissionsStatusResult>; ts: number } | null = null;
const STATUS_CACHE_TTL = 60_000;

export const fetchPermissionsStatusClient =
  async (): Promise<PermissionsStatusResult> => {
    const now = Date.now();
    if (statusCache && now - statusCache.ts < STATUS_CACHE_TTL) {
      return statusCache.promise;
    }

    const promise = fetch("/api/v1/permissions/status", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => handleResponse<PermissionsStatusResult>(res))
      .catch((err) => {
        // Invalidate cache on failure so next call retries immediately
        if (statusCache?.promise === promise) {
          statusCache = null;
        }
        throw err;
      });

    statusCache = { promise, ts: now };
    return promise;
  };

export const invalidatePermissionsStatusCache = () => {
  statusCache = null;
};

export const fetchInstitutionsClient = async (): Promise<
  Array<{ institutionId: number; companyName: string }>
> => {
  const data = await handleResponse<{
    institutions: Array<{ institutionId: number; companyName: string }>;
  }>(
    await fetch("/api/v1/permissions/institutions", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.institutions;
};

export const updateRolePermissionsClient = async (
  roleId: number,
  permissionIds: number[],
  institutionId?: number,
): Promise<void> => {
  const body: Record<string, unknown> = { permissionIds };
  if (institutionId) {
    body.institutionId = institutionId;
  }
  await handleResponse(
    await fetch(`/api/v1/permissions/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

export const updateUserRolesClient = async (
  userId: number,
  roleIds: number[],
  institutionId?: number,
): Promise<void> => {
  const body: Record<string, unknown> = { roleIds };
  if (institutionId) {
    body.institutionId = institutionId;
  }
  await handleResponse(
    await fetch(`/api/v1/permissions/users/${userId}/roles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

export const fetchInstitutionFeaturesClient = async (
  institutionId: number,
): Promise<InstitutionFeature[]> => {
  const data = await handleResponse<{ features: InstitutionFeature[] }>(
    await fetch(`/api/v1/permissions/features?institutionId=${institutionId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.features;
};

export const updateInstitutionFeaturesClient = async (
  institutionId: number,
  features: Record<string, boolean>,
): Promise<void> => {
  await handleResponse(
    await fetch("/api/v1/permissions/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId, features }),
    }),
  );
};

// ---------------------------------------------------------------------------
// Per-user feature toggles
// ---------------------------------------------------------------------------

export type UserFeature = {
  key: string;
  label: string;
  path: string;
  isEnabled: boolean;
};

export const fetchUserFeaturesClient = async (
  userId: number,
): Promise<UserFeature[]> => {
  const data = await handleResponse<{ features: UserFeature[] }>(
    await fetch(`/api/v1/users/${userId}/features`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.features;
};

export const updateUserFeaturesClient = async (
  userId: number,
  features: Record<string, boolean>,
): Promise<void> => {
  await handleResponse(
    await fetch(`/api/v1/users/${userId}/features`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  );
};

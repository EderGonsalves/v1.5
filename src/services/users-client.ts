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

export const fetchUsersClient = async (
  institutionId?: number,
): Promise<UserPublicRow[]> => {
  const params = institutionId ? `?institutionId=${institutionId}` : "";
  const data = await handleResponse<{ users: UserPublicRow[] }>(
    await fetch(`/api/v1/users${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.users;
};

export const createUserClient = async (payload: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  oab?: string;
  institutionId?: number;
}): Promise<UserPublicRow> => {
  const data = await handleResponse<{ user: UserPublicRow }>(
    await fetch("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.user;
};

export const updateUserClient = async (
  userId: number,
  payload: {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    oab?: string;
    isActive?: boolean;
  },
): Promise<UserPublicRow> => {
  const data = await handleResponse<{ user: UserPublicRow }>(
    await fetch(`/api/v1/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.user;
};

export const deleteUserClient = async (userId: number): Promise<void> => {
  await handleResponse<Record<string, never>>(
    await fetch(`/api/v1/users/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

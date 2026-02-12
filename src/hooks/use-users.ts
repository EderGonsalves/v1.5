"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { UserPublicRow } from "@/services/permissions";
import {
  fetchUsersClient,
  createUserClient,
  updateUserClient,
  deleteUserClient,
} from "@/services/users-client";

export const useUsers = (
  institutionId: number | undefined,
  selectedInstitutionId?: number,
) => {
  const [users, setUsers] = useState<UserPublicRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isFetchingRef = useRef(false);

  const fetchUsers = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!institutionId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      const { silent } = options;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const data = await fetchUsersClient(selectedInstitutionId);
        setUsers(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar usuários",
        );
      } finally {
        isFetchingRef.current = false;
        if (!silent) setIsLoading(false);
      }
    },
    [institutionId, selectedInstitutionId],
  );

  useEffect(() => {
    if (!institutionId) {
      setIsLoading(false);
      return;
    }
    fetchUsers();
  }, [institutionId, fetchUsers]);

  const refresh = useCallback(() => fetchUsers({ silent: true }), [fetchUsers]);

  const createUser = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      oab?: string;
      institutionId?: number;
      isOfficeAdmin?: boolean;
    }) => {
      const user = await createUserClient(data);
      setUsers((prev) => [...prev, user]);
      return user;
    },
    [],
  );

  const updateUser = useCallback(
    async (
      userId: number,
      data: {
        name?: string;
        email?: string;
        password?: string;
        phone?: string;
        oab?: string;
        isActive?: boolean;
        isOfficeAdmin?: boolean;
      },
    ) => {
      setUpdatingIds((prev) => new Set(prev).add(userId));
      try {
        const updated = await updateUserClient(userId, data);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? updated : u)),
        );
        return updated;
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [],
  );

  const deleteUser = useCallback(async (userId: number) => {
    setUpdatingIds((prev) => new Set(prev).add(userId));
    try {
      await deleteUserClient(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  const isUserUpdating = useCallback(
    (userId: number) => updatingIds.has(userId),
    [updatingIds],
  );

  return {
    users,
    isLoading,
    error,
    refresh,
    createUser,
    updateUser,
    deleteUser,
    isUserUpdating,
  };
};

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PermissionsOverview } from "@/services/permissions";
import {
  fetchPermissionsOverviewClient,
  updateRolePermissionsClient,
  updateUserRolesClient,
} from "@/services/permissions-client";

const normalizeIds = (ids: number[]) =>
  Array.from(new Set(ids.filter((id) => Number.isFinite(id))));

export const usePermissionsAdmin = (
  authSignature?: string | null,
  targetInstitutionId?: number,
) => {
  const [overview, setOverview] = useState<PermissionsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingRoles, setUpdatingRoles] = useState<number[]>([]);
  const [updatingUsers, setUpdatingUsers] = useState<number[]>([]);

  const isSysAdmin = overview?.isSysAdmin ?? false;
  const isGlobalAdmin = overview?.isGlobalAdmin ?? false;

  const loadOverview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!authSignature) {
        setOverview(null);
        setIsLoading(false);
        return;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }
      try {
        const data = await fetchPermissionsOverviewClient(targetInstitutionId);
        setOverview(data);
        setError(null);
      } catch (err) {
        console.error("Falha ao carregar overview de permissões", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as permissões",
        );
        if (!options?.silent) {
          setOverview(null);
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [authSignature, targetInstitutionId],
  );

  useEffect(() => {
    if (!authSignature) {
      setOverview(null);
      setIsLoading(false);
      return;
    }
    void loadOverview();
  }, [authSignature, targetInstitutionId, loadOverview]);

  const toggleRoleUpdate = useCallback((roleId: number, busy: boolean) => {
    setUpdatingRoles((prev) => {
      if (busy) {
        return prev.includes(roleId) ? prev : [...prev, roleId];
      }
      return prev.filter((id) => id !== roleId);
    });
  }, []);

  const toggleUserUpdate = useCallback((userId: number, busy: boolean) => {
    setUpdatingUsers((prev) => {
      if (busy) {
        return prev.includes(userId) ? prev : [...prev, userId];
      }
      return prev.filter((id) => id !== userId);
    });
  }, []);

  const updateRolePermissions = useCallback(
    async (roleId: number, permissionIds: number[]) => {
      if (!overview || !authSignature) return;
      toggleRoleUpdate(roleId, true);
      const normalized = normalizeIds(permissionIds);

      try {
        await updateRolePermissionsClient(
          roleId,
          normalized,
          targetInstitutionId,
        );
        await loadOverview({ silent: true });
      } catch (err) {
        console.error("Falha ao atualizar permissões do papel", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível salvar as permissões do papel",
        );
        throw err;
      } finally {
        toggleRoleUpdate(roleId, false);
      }
    },
    [overview, toggleRoleUpdate, loadOverview, authSignature, targetInstitutionId],
  );

  const updateUserRoles = useCallback(
    async (userId: number, roleIds: number[]) => {
      if (!overview || !authSignature) return;
      toggleUserUpdate(userId, true);
      const normalized = normalizeIds(roleIds);

      try {
        await updateUserRolesClient(userId, normalized, targetInstitutionId);
        await loadOverview({ silent: true });
      } catch (err) {
        console.error("Falha ao atualizar os papéis do usuário", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível salvar os papéis do usuário",
        );
        throw err;
      } finally {
        toggleUserUpdate(userId, false);
      }
    },
    [overview, toggleUserUpdate, loadOverview, authSignature, targetInstitutionId],
  );

  const isRoleUpdating = useCallback(
    (roleId: number) => updatingRoles.includes(roleId),
    [updatingRoles],
  );

  const isUserUpdating = useCallback(
    (userId: number) => updatingUsers.includes(userId),
    [updatingUsers],
  );

  const usersWithRoles = useMemo(() => {
    if (!overview) return [];
    return overview.users.map((user) => {
      const assignedRoleIds = overview.userRoles
        .filter((rel) => rel.userId === user.id)
        .map((rel) => rel.roleId);
      return {
        ...user,
        roleIds: assignedRoleIds,
      };
    });
  }, [overview]);

  return {
    overview,
    isLoading,
    error,
    isSysAdmin,
    isGlobalAdmin,
    refresh: () => {
      void loadOverview();
    },
    updateRolePermissions,
    updateUserRoles,
    isRoleUpdating,
    isUserUpdating,
    usersWithRoles,
  };
};

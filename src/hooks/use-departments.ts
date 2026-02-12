"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DepartmentPublicRow } from "@/services/departments";
import {
  fetchDepartmentsClient,
  createDepartmentClient,
  updateDepartmentClient,
  deleteDepartmentClient,
} from "@/services/departments-client";

export const useDepartments = (
  institutionId: number | undefined,
  selectedInstitutionId?: number,
) => {
  const [departments, setDepartments] = useState<DepartmentPublicRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isFetchingRef = useRef(false);

  const fetchDepartments = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!institutionId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      const { silent } = options;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const data = await fetchDepartmentsClient(selectedInstitutionId);
        setDepartments(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar departamentos",
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
    fetchDepartments();
  }, [institutionId, fetchDepartments]);

  const refresh = useCallback(
    () => fetchDepartments({ silent: true }),
    [fetchDepartments],
  );

  const createDepartment = useCallback(
    async (data: {
      name: string;
      description?: string;
      institutionId?: number;
    }) => {
      const department = await createDepartmentClient(data);
      setDepartments((prev) => [...prev, department]);
      return department;
    },
    [],
  );

  const updateDepartment = useCallback(
    async (
      departmentId: number,
      data: {
        name?: string;
        description?: string;
        isActive?: boolean;
      },
    ) => {
      setUpdatingIds((prev) => new Set(prev).add(departmentId));
      try {
        const updated = await updateDepartmentClient(departmentId, data);
        setDepartments((prev) =>
          prev.map((d) => (d.id === departmentId ? updated : d)),
        );
        return updated;
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(departmentId);
          return next;
        });
      }
    },
    [],
  );

  const deleteDepartment = useCallback(async (departmentId: number) => {
    setUpdatingIds((prev) => new Set(prev).add(departmentId));
    try {
      await deleteDepartmentClient(departmentId);
      setDepartments((prev) => prev.filter((d) => d.id !== departmentId));
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(departmentId);
        return next;
      });
    }
  }, []);

  const isDepartmentUpdating = useCallback(
    (departmentId: number) => updatingIds.has(departmentId),
    [updatingIds],
  );

  return {
    departments,
    isLoading,
    error,
    refresh,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    isDepartmentUpdating,
  };
};

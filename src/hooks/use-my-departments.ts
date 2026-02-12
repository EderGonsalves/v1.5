"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DepartmentPublicRow } from "@/services/departments";
import {
  fetchMyDepartmentsClient,
  type MyDepartmentsResponse,
} from "@/services/departments-client";

export const useMyDepartments = () => {
  const [departments, setDepartments] = useState<DepartmentPublicRow[]>([]);
  const [userDepartmentIds, setUserDepartmentIds] = useState<number[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isOfficeAdmin, setIsOfficeAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      const { silent } = options;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const data: MyDepartmentsResponse = await fetchMyDepartmentsClient();
        setDepartments(data.departments);
        setUserDepartmentIds(data.userDepartmentIds);
        setIsGlobalAdmin(data.isGlobalAdmin);
        setIsOfficeAdmin(data.isOfficeAdmin === true);
        setUserId(data.userId ?? null);
        setUserName(data.userName ?? "");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar departamentos do usuário",
        );
      } finally {
        isFetchingRef.current = false;
        if (!silent) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(
    () => fetchData({ silent: true }),
    [fetchData],
  );

  return {
    departments,
    userDepartmentIds,
    userId,
    userName,
    isGlobalAdmin,
    isOfficeAdmin,
    isLoading,
    error,
    refresh,
  };
};

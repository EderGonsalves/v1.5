"use client";

import { useEffect, useState } from "react";

import { ALL_FEATURE_PATHS } from "@/lib/feature-registry";
import { fetchPermissionsStatusClient } from "@/services/permissions-client";

export const usePermissionsStatus = (authSignature?: string | null) => {
  const [isSysAdmin, setIsSysAdmin] = useState(false);
  const [enabledPages, setEnabledPages] = useState<string[]>(ALL_FEATURE_PATHS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!authSignature) {
      setIsSysAdmin(false);
      setEnabledPages(ALL_FEATURE_PATHS);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);

    const load = async () => {
      try {
        const status = await fetchPermissionsStatusClient();
        if (active) {
          setIsSysAdmin(Boolean(status.isSysAdmin));
          setEnabledPages(
            Array.isArray(status.enabledPages)
              ? status.enabledPages
              : ALL_FEATURE_PATHS,
          );
        }
      } catch (error) {
        console.warn("Não foi possível verificar status de permissões", error);
        if (active) {
          setIsSysAdmin(false);
          setEnabledPages(ALL_FEATURE_PATHS);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [authSignature]);

  return {
    isSysAdmin,
    enabledPages,
    isLoading,
  };
};

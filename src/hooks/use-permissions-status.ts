"use client";

import { useEffect, useState } from "react";

import { ALL_FEATURE_PATHS } from "@/lib/feature-registry";
import { fetchPermissionsStatusClient } from "@/services/permissions-client";

export const usePermissionsStatus = (authSignature?: string | null) => {
  const [isSysAdmin, setIsSysAdmin] = useState(false);
  const [isOfficeAdmin, setIsOfficeAdmin] = useState(false);
  const [enabledPages, setEnabledPages] = useState<string[]>([]);
  const [enabledActions, setEnabledActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!authSignature) {
      setIsSysAdmin(false);
      setIsOfficeAdmin(false);
      setEnabledPages([]);
      setEnabledActions([]);
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
          setIsOfficeAdmin(Boolean(status.isOfficeAdmin));
          setEnabledPages(
            Array.isArray(status.enabledPages)
              ? status.enabledPages
              : ALL_FEATURE_PATHS,
          );
          setEnabledActions(
            Array.isArray(status.enabledActions)
              ? status.enabledActions
              : [],
          );
        }
      } catch (error) {
        console.warn("Não foi possível verificar status de permissões", error);
        if (active) {
          setIsSysAdmin(false);
          setIsOfficeAdmin(false);
          setEnabledPages(ALL_FEATURE_PATHS);
          setEnabledActions([]);
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
    isOfficeAdmin,
    enabledPages,
    enabledActions,
    isLoading,
  };
};

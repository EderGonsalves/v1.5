"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Users,
  Building2,
  LayoutGrid,
  Loader2,
} from "lucide-react";

import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Switch } from "@/components/ui/switch";
import { usePermissionsAdmin } from "@/hooks/use-permissions-admin";
import {
  fetchInstitutionsClient,
  fetchInstitutionFeaturesClient,
  updateInstitutionFeaturesClient,
} from "@/services/permissions-client";
import type { InstitutionFeature } from "@/services/permissions";

export default function PermissionsAdminPage() {
  const { data, isHydrated } = useOnboarding();
  const authSignature = data.auth
    ? `${data.auth.institutionId}:${data.auth.legacyUserId ?? ""}`
    : null;

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    number | undefined
  >(undefined);
  const [institutions, setInstitutions] = useState<
    Array<{ institutionId: number; companyName: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  const [features, setFeatures] = useState<InstitutionFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [updatingFeatureKeys, setUpdatingFeatureKeys] = useState<Set<string>>(
    new Set(),
  );

  const {
    overview,
    usersWithRoles,
    isLoading,
    isSysAdmin,
    isGlobalAdmin,
    error,
    refresh,
    updateUserRoles,
    isUserUpdating,
  } = usePermissionsAdmin(authSignature, selectedInstitutionId);

  useEffect(() => {
    if (!data.auth || data.auth.institutionId !== 4) return;

    let active = true;
    setLoadingInstitutions(true);

    fetchInstitutionsClient()
      .then((list) => {
        if (active) setInstitutions(list);
      })
      .catch((err) => {
        console.warn("Erro ao carregar instituições:", err);
      })
      .finally(() => {
        if (active) setLoadingInstitutions(false);
      });

    return () => {
      active = false;
    };
  }, [data.auth]);

  const featuresInstitutionId =
    selectedInstitutionId ?? data.auth?.institutionId;

  useEffect(() => {
    if (!featuresInstitutionId || !isSysAdmin) return;

    let active = true;
    setLoadingFeatures(true);

    fetchInstitutionFeaturesClient(featuresInstitutionId)
      .then((list) => {
        if (active) setFeatures(list);
      })
      .catch((err) => {
        console.warn("Erro ao carregar funcionalidades:", err);
      })
      .finally(() => {
        if (active) setLoadingFeatures(false);
      });

    return () => {
      active = false;
    };
  }, [featuresInstitutionId, isSysAdmin]);

  const handleToggleFeature = useCallback(
    async (featureKey: string, enabled: boolean) => {
      if (!featuresInstitutionId) return;

      setUpdatingFeatureKeys((prev) => new Set(prev).add(featureKey));

      setFeatures((prev) =>
        prev.map((f) =>
          f.key === featureKey ? { ...f, isEnabled: enabled } : f,
        ),
      );

      try {
        await updateInstitutionFeaturesClient(featuresInstitutionId, {
          [featureKey]: enabled,
        });
      } catch (err) {
        console.error("Erro ao atualizar funcionalidade:", err);
        setFeatures((prev) =>
          prev.map((f) =>
            f.key === featureKey ? { ...f, isEnabled: !enabled } : f,
          ),
        );
      } finally {
        setUpdatingFeatureKeys((prev) => {
          const next = new Set(prev);
          next.delete(featureKey);
          return next;
        });
      }
    },
    [featuresInstitutionId],
  );

  const handleToggleUserRole = useCallback(
    (userId: number, roleId: number, checked: boolean) => {
      const user = usersWithRoles.find((entry) => entry.id === userId);
      if (!user) return;

      const next = new Set(user.roleIds);
      if (checked) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }

      void updateUserRoles(userId, Array.from(next));
    },
    [usersWithRoles, updateUserRoles],
  );

  if (!isHydrated || !data.auth) {
    return <LoadingScreen message="Validando sessão..." />;
  }

  if (isLoading && !overview) {
    return <LoadingScreen message="Carregando permissões..." />;
  }

  if (!isLoading && !isSysAdmin) {
    return (
      <main className="min-h-screen bg-background py-4">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">
            Acesso restrito
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Apenas o SysAdmin pode acessar esta página.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Permissões
            </h2>
            <p className="text-xs text-muted-foreground">
              Gerencie funcionalidades e perfis de acesso
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
              {isGlobalAdmin ? "Admin Global" : "SysAdmin"}
            </span>
          </div>
        </div>

        {/* Institution selector - global admin only */}
        {isGlobalAdmin && institutions.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3 border-b border-[#7E99B5] dark:border-border/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Instituição
              </span>
            </div>
            <select
              value={selectedInstitutionId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedInstitutionId(val ? Number(val) : undefined);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground truncate sm:w-auto sm:max-w-[280px]"
              disabled={loadingInstitutions}
            >
              <option value="">
                Minha instituição ({data.auth.institutionId})
              </option>
              {institutions
                .filter((i) => i.institutionId !== data.auth!.institutionId)
                .map((inst) => (
                  <option key={inst.institutionId} value={inst.institutionId}>
                    {inst.companyName} ({inst.institutionId})
                  </option>
                ))}
            </select>
          </div>
        )}

        {error && (
          <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Funcionalidades do Sistema */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              Funcionalidades
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedInstitutionId
              ? `Instituição ${selectedInstitutionId}`
              : "Esta instituição"}
          </p>
        </div>

        {loadingFeatures ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando funcionalidades...
          </div>
        ) : features.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <LayoutGrid className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhuma funcionalidade configurada.
            </p>
          </div>
        ) : (
          features.map((feature) => {
            const isUpdating = updatingFeatureKeys.has(feature.key);
            return (
              <div
                key={feature.key}
                className="flex items-center justify-between border-b border-[#7E99B5] px-4 py-3 dark:border-border/60"
              >
                <div>
                  <p className="text-sm font-semibold">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {feature.path}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isUpdating && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                  <Switch
                    checked={feature.isEnabled}
                    onCheckedChange={(checked) =>
                      handleToggleFeature(feature.key, checked)
                    }
                    disabled={isUpdating}
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Usuários e perfis */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60 mt-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              Usuários e perfis
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Atribua perfis de acesso aos usuários
          </p>
        </div>

        {!usersWithRoles.length ? (
          <div className="px-4 py-8 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum usuário sincronizado.
            </p>
          </div>
        ) : (
          usersWithRoles.map((user) => (
            <div
              key={user.id}
              className="border-b border-[#7E99B5] px-4 py-3 dark:border-border/60"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {user.name || user.email || `Usuário #${user.id}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email || "sem e-mail"}
                    {user.legacyUserId
                      ? ` • ID: ${user.legacyUserId}`
                      : ""}
                  </p>
                </div>
                {isUserUpdating(user.id) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {overview?.roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Checkbox
                      checked={user.roleIds.includes(role.id)}
                      onCheckedChange={(checked) =>
                        handleToggleUserRole(
                          user.id,
                          role.id,
                          Boolean(checked),
                        )
                      }
                      disabled={isUserUpdating(user.id)}
                    />
                    <span className="text-foreground">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  RefreshCw,
  Loader2,
  Plus,
  X,
  Check,
  Eye,
  EyeOff,
  Building2,
  ShieldOff,
  ShieldCheck,
  ListOrdered,
  CalendarClock,
  Hash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useUsers } from "@/hooks/use-users";
import { useMyDepartments } from "@/hooks/use-my-departments";
import {
  fetchInstitutionsClient,
  fetchUserFeaturesClient,
  updateUserFeaturesClient,
  invalidatePermissionsStatusCache,
  type UserFeature,
} from "@/services/permissions-client";
import {
  fetchQueueStatsClient,
  type QueueStats,
} from "@/services/assignment-queue-client";

type UserFormData = {
  name: string;
  email: string;
  password: string;
  phone: string;
  oab: string;
  isActive: boolean;
  isOfficeAdmin: boolean;
};

const emptyForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  phone: "",
  oab: "",
  isActive: true,
  isOfficeAdmin: false,
};

function UserForm({
  initial,
  isEdit,
  onSubmit,
  onCancel,
  isSubmitting,
  canToggleAdmin,
}: {
  initial: UserFormData;
  isEdit: boolean;
  onSubmit: (data: UserFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  canToggleAdmin?: boolean;
}) {
  const [form, setForm] = useState<UserFormData>(initial);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError("Nome é obrigatório");
      return;
    }
    if (!form.email.trim()) {
      setFormError("E-mail é obrigatório");
      return;
    }
    if (!isEdit && !form.password) {
      setFormError("Senha é obrigatória");
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao salvar usuário",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Nome *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="h-9 text-sm"
        />
        <Input
          placeholder="E-mail *"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="h-9 text-sm"
        />
        <div className="relative">
          <Input
            placeholder={isEdit ? "Nova senha (deixe vazio para manter)" : "Senha *"}
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="h-9 pr-9 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <Input
          placeholder="Telefone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="h-9 text-sm"
        />
        <Input
          placeholder="OAB"
          value={form.oab}
          onChange={(e) => setForm({ ...form, oab: e.target.value })}
          className="h-9 text-sm"
        />
        {isEdit && (
          <div className="flex items-center gap-2 h-9">
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm({ ...form, isActive: checked })
              }
            />
            <span className="text-sm text-foreground">
              {form.isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
        )}
        {canToggleAdmin && (
          <div className="flex items-center gap-2 h-9">
            <span className="text-xs text-muted-foreground">Perfil:</span>
            <Switch
              checked={form.isOfficeAdmin}
              onCheckedChange={(checked) =>
                setForm({ ...form, isOfficeAdmin: checked })
              }
            />
            <span className="text-sm font-medium text-foreground">
              {form.isOfficeAdmin ? "Admin do Escritório" : "Usuário comum"}
            </span>
          </div>
        )}
      </div>

      {formError && (
        <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          className="gap-1"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {isEdit ? "Salvar" : "Criar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
          className="gap-1"
        >
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default function UsuariosPage() {
  const { data } = useOnboarding();
  const isSysAdmin = data.auth?.institutionId === 4;
  const { isOfficeAdmin: isMyOfficeAdmin, userId: myUserId } = useMyDepartments();
  // SysAdmin or office admin can toggle admin flag on other users
  const canManageAdmins = isSysAdmin || isMyOfficeAdmin;

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    number | undefined
  >(undefined);
  const [institutions, setInstitutions] = useState<
    Array<{ institutionId: number; companyName: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  // For sysAdmin: undefined means all users; a number filters by institution
  const {
    users,
    isLoading,
    error,
    refresh,
    createUser,
    updateUser,
    isUserUpdating,
  } = useUsers(data.auth?.institutionId ?? undefined, selectedInstitutionId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResettingAdmins, setIsResettingAdmins] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Per-user feature toggles
  const [userFeatures, setUserFeatures] = useState<UserFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [updatingFeatureKeys, setUpdatingFeatureKeys] = useState<Set<string>>(new Set());

  // Queue stats
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loadingQueueStats, setLoadingQueueStats] = useState(false);
  const [updatingReceivesCases, setUpdatingReceivesCases] = useState(false);

  // Load user features when editing a user
  useEffect(() => {
    if (!editingId) {
      setUserFeatures([]);
      return;
    }
    // Don't load for office admins (they see everything)
    const editingUser = users.find((u) => u.id === editingId);
    if (editingUser?.isOfficeAdmin) {
      setUserFeatures([]);
      return;
    }
    let active = true;
    setLoadingFeatures(true);
    fetchUserFeaturesClient(editingId)
      .then((features) => {
        if (active) setUserFeatures(features);
      })
      .catch((err) => {
        console.warn("Erro ao carregar permissões do usuário:", err);
        if (active) setUserFeatures([]);
      })
      .finally(() => {
        if (active) setLoadingFeatures(false);
      });
    return () => { active = false; };
  }, [editingId, users]);

  const handleToggleUserFeature = useCallback(
    async (featureKey: string, enabled: boolean) => {
      if (!editingId) return;
      setUpdatingFeatureKeys((prev) => new Set(prev).add(featureKey));
      // Optimistic update
      setUserFeatures((prev) =>
        prev.map((f) => (f.key === featureKey ? { ...f, isEnabled: enabled } : f)),
      );
      try {
        await updateUserFeaturesClient(editingId, { [featureKey]: enabled });
        invalidatePermissionsStatusCache();
      } catch (err) {
        console.error("Erro ao atualizar permissão:", err);
        // Rollback
        setUserFeatures((prev) =>
          prev.map((f) => (f.key === featureKey ? { ...f, isEnabled: !enabled } : f)),
        );
      } finally {
        setUpdatingFeatureKeys((prev) => {
          const next = new Set(prev);
          next.delete(featureKey);
          return next;
        });
      }
    },
    [editingId],
  );

  // Load queue stats when editing a user
  useEffect(() => {
    if (!editingId) {
      setQueueStats(null);
      return;
    }
    const editingUser = users.find((u) => u.id === editingId);
    let active = true;
    setLoadingQueueStats(true);
    fetchQueueStatsClient(editingId, editingUser?.institutionId)
      .then((stats) => {
        if (active) setQueueStats(stats);
      })
      .catch((err) => {
        console.warn("Erro ao carregar stats da fila:", err);
        if (active) setQueueStats(null);
      })
      .finally(() => {
        if (active) setLoadingQueueStats(false);
      });
    return () => { active = false; };
  }, [editingId, users]);

  const handleToggleReceivesCases = useCallback(
    async (userId: number, checked: boolean) => {
      setUpdatingReceivesCases(true);
      try {
        await updateUser(userId, { receivesCases: checked });
        // Reload queue stats with the correct institutionId
        const targetUser = users.find((u) => u.id === userId);
        fetchQueueStatsClient(userId, targetUser?.institutionId)
          .then(setQueueStats)
          .catch(() => {});
      } catch (err) {
        console.error("Erro ao atualizar receives_cases:", err);
      } finally {
        setUpdatingReceivesCases(false);
      }
    },
    [updateUser, users],
  );

  // Load institutions list for sysAdmin
  useEffect(() => {
    if (!isSysAdmin) return;
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
  }, [isSysAdmin]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const handleResetAdmins = useCallback(async () => {
    if (!confirm("Tem certeza? Isso vai remover o flag admin de TODOS os usuários.")) return;
    setIsResettingAdmins(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/v1/users/reset-admin", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao resetar");
      setResetMessage(json.message);
      await refresh();
    } catch (err) {
      setResetMessage(err instanceof Error ? err.message : "Erro ao resetar flags");
    } finally {
      setIsResettingAdmins(false);
    }
  }, [refresh]);

  const handleCreate = useCallback(
    async (form: UserFormData) => {
      setIsSubmitting(true);
      try {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          oab: form.oab || undefined,
          institutionId: selectedInstitutionId,
          isOfficeAdmin: form.isOfficeAdmin || undefined,
        });
        setShowCreateForm(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [createUser, selectedInstitutionId],
  );

  const handleUpdate = useCallback(
    async (userId: number, form: UserFormData) => {
      setIsSubmitting(true);
      try {
        const payload: Record<string, string | boolean | undefined> = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          oab: form.oab || undefined,
          isActive: form.isActive,
        };
        if (form.password) {
          payload.password = form.password;
        }
        if (canManageAdmins) {
          payload.isOfficeAdmin = form.isOfficeAdmin;
        }
        await updateUser(userId, payload);
        setEditingId(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [updateUser, canManageAdmins],
  );

  if (isLoading) {
    return <LoadingScreen message="Carregando usuários..." />;
  }

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </h2>
            <p className="text-xs text-muted-foreground">
              {isSysAdmin
                ? selectedInstitutionId
                  ? `Instituição #${selectedInstitutionId}`
                  : "Todas as instituições"
                : "Gerencie os usuários da sua instituição"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreateForm(true);
                setEditingId(null);
              }}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Novo Usuário</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Institution selector - sysAdmin only */}
        {isSysAdmin && (
          <div className="flex flex-col gap-2 px-4 py-3 border-b border-[#7E99B5] dark:border-border/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Instituição</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedInstitutionId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedInstitutionId(val ? Number(val) : undefined);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground truncate sm:w-auto sm:max-w-[280px]"
                disabled={loadingInstitutions}
              >
                <option value="">Todas</option>
                {institutions.map((inst) => (
                  <option key={inst.institutionId} value={inst.institutionId}>
                    {inst.companyName} ({inst.institutionId})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetAdmins}
                disabled={isResettingAdmins}
                className="gap-1 text-xs shrink-0"
                title="Resetar flag admin de todos os usuários"
              >
                {isResettingAdmins ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldOff className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Reset Admins</span>
              </Button>
            </div>
          </div>
        )}
        {resetMessage && (
          <div className="mx-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200 flex items-center justify-between">
            <span>{resetMessage}</span>
            <button onClick={() => setResetMessage(null)} className="ml-2 text-blue-500 hover:text-blue-700">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {error && (
          <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="border-b border-[#7E99B5] dark:border-border/60">
            <div className="px-4 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Novo Usuário
              </p>
            </div>
            <UserForm
              initial={emptyForm}
              isEdit={false}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isSubmitting={isSubmitting}
              canToggleAdmin={canManageAdmins}
            />
          </div>
        )}

        {/* Users List */}
        {users.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum usuário cadastrado.
            </p>
          </div>
        ) : (
          users.map((user) => {
            const isEditing = editingId === user.id;
            const updating = isUserUpdating(user.id);

            if (isEditing) {
              return (
                <div
                  key={user.id}
                  className="border-b border-[#7E99B5] dark:border-border/60"
                >
                  <div className="px-4 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Editando: {user.name || user.email}
                    </p>
                  </div>
                  <Tabs defaultValue="dados" className="px-4 pb-3">
                    <TabsList className="mb-2">
                      <TabsTrigger value="dados">Dados</TabsTrigger>
                      <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
                    </TabsList>

                    {/* Tab: Dados */}
                    <TabsContent value="dados">
                      <UserForm
                        initial={{
                          name: user.name,
                          email: user.email,
                          password: "",
                          phone: user.phone,
                          oab: user.oab,
                          isActive: user.isActive,
                          isOfficeAdmin: user.isOfficeAdmin,
                        }}
                        isEdit
                        onSubmit={(form) => handleUpdate(user.id, form)}
                        onCancel={() => setEditingId(null)}
                        isSubmitting={isSubmitting}
                        canToggleAdmin={canManageAdmins && user.id !== myUserId}
                      />
                      {/* Per-user feature permissions (only for non-admin users) */}
                      {!user.isOfficeAdmin && (
                        <div className="pb-1">
                          <div className="flex items-center gap-2 py-2 mb-2 border-t border-dashed border-[#7E99B5] dark:border-border/60">
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Permissões de Acesso
                            </span>
                          </div>
                          {loadingFeatures ? (
                            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Carregando...
                            </div>
                          ) : userFeatures.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">
                              Nenhuma permissão configurável disponível.
                            </p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {userFeatures.map((feature) => {
                                const isUpdating = updatingFeatureKeys.has(feature.key);
                                return (
                                  <div
                                    key={feature.key}
                                    className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
                                  >
                                    <span className="text-sm text-foreground">
                                      {feature.label}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      {isUpdating && (
                                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                      )}
                                      <Switch
                                        checked={feature.isEnabled}
                                        onCheckedChange={(checked) =>
                                          handleToggleUserFeature(feature.key, checked)
                                        }
                                        disabled={isUpdating}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    {/* Tab: Atendimento */}
                    <TabsContent value="atendimento">
                      <div className="space-y-4 py-2">
                        {/* Toggle Recebe Casos */}
                        <div className="flex items-center justify-between rounded-md border border-border/40 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              Recebe casos
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Quando ativado, este usuário entra na fila de distribuição automática
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {updatingReceivesCases && (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            )}
                            <Switch
                              checked={user.receivesCases}
                              onCheckedChange={(checked) =>
                                handleToggleReceivesCases(user.id, checked)
                              }
                              disabled={updatingReceivesCases}
                            />
                          </div>
                        </div>

                        {/* Queue Stats */}
                        <div className="flex items-center gap-2 py-1">
                          <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Estatísticas da Fila
                          </span>
                        </div>
                        {loadingQueueStats ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Carregando...
                          </div>
                        ) : queueStats ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border border-border/40 px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                                <ListOrdered className="h-3 w-3" />
                                <span className="text-[10px] uppercase tracking-wide">Posição</span>
                              </div>
                              <p className="text-lg font-bold text-foreground">
                                {user.receivesCases
                                  ? `${queueStats.position}/${queueStats.totalEligible}`
                                  : "-"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border/40 px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                                <Hash className="h-3 w-3" />
                                <span className="text-[10px] uppercase tracking-wide">Atribuídos</span>
                              </div>
                              <p className="text-lg font-bold text-foreground">
                                {queueStats.totalAssigned}
                              </p>
                            </div>
                            <div className="rounded-md border border-border/40 px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                                <CalendarClock className="h-3 w-3" />
                                <span className="text-[10px] uppercase tracking-wide">Última</span>
                              </div>
                              <p className="text-xs font-medium text-foreground">
                                {queueStats.lastAssignedAt
                                  ? new Date(queueStats.lastAssignedAt).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Nunca"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-1">
                            Sem dados disponíveis.
                          </p>
                        )}

                        {/* Cancel button for this tab */}
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            className="gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            Fechar
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              );
            }

            return (
              <div
                key={user.id}
                className="flex items-center justify-between border-b border-[#7E99B5] px-4 py-3 dark:border-border/60 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => {
                  setEditingId(user.id);
                  setShowCreateForm(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">
                      {user.name || "Sem nome"}
                    </p>
                    {user.isOfficeAdmin && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                        Admin
                      </span>
                    )}
                    {!user.isActive && (
                      <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900 dark:text-red-200">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                    {user.phone ? ` | ${user.phone}` : ""}
                    {user.oab ? ` | OAB: ${user.oab}` : ""}
                    {isSysAdmin && user.institutionId
                      ? ` | Inst. #${user.institutionId}`
                      : ""}
                  </p>
                </div>
                {updating && (
                  <Loader2 className="ml-3 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

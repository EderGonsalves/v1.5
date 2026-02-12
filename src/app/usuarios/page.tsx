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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useUsers } from "@/hooks/use-users";
import { useMyDepartments } from "@/hooks/use-my-departments";
import { fetchInstitutionsClient } from "@/services/permissions-client";

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
            <Switch
              checked={form.isOfficeAdmin}
              onCheckedChange={(checked) =>
                setForm({ ...form, isOfficeAdmin: checked })
              }
            />
            <span className="text-sm text-foreground">
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

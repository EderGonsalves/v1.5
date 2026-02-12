"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  RefreshCw,
  Loader2,
  Plus,
  X,
  Check,
  UsersIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useDepartments } from "@/hooks/use-departments";
import { useUsers } from "@/hooks/use-users";
import { useMyDepartments } from "@/hooks/use-my-departments";
import { fetchInstitutionsClient } from "@/services/permissions-client";
import {
  fetchDepartmentUsersClient,
  setDepartmentUsersClient,
} from "@/services/departments-client";
import type { UserPublicRow } from "@/services/permissions";

// ---------------------------------------------------------------------------
// Department form
// ---------------------------------------------------------------------------

type DeptFormData = {
  name: string;
  description: string;
};

const emptyForm: DeptFormData = { name: "", description: "" };

function DeptForm({
  initial,
  isEdit,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initial: DeptFormData;
  isEdit: boolean;
  onSubmit: (data: DeptFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<DeptFormData>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Nome é obrigatório");
      return;
    }
    try {
      await onSubmit(form);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao salvar departamento",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Nome do departamento *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Descrição (opcional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="h-9 text-sm"
        />
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

// ---------------------------------------------------------------------------
// Members manager (inline)
// ---------------------------------------------------------------------------

function MembersManager({
  departmentId,
  allUsers,
  onClose,
}: {
  departmentId: number;
  allUsers: UserPublicRow[];
  onClose: () => void;
}) {
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchDepartmentUsersClient(departmentId)
      .then((users) => {
        if (active) setMemberIds(new Set(users.map((u) => u.id)));
      })
      .catch(() => {
        if (active) setError("Erro ao carregar membros");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [departmentId]);

  const toggleUser = (userId: number) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await setDepartmentUsersClient(departmentId, Array.from(memberIds));
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar membros",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs text-muted-foreground">
          Carregando membros...
        </span>
      </div>
    );
  }

  const activeUsers = allUsers.filter((u) => u.isActive);

  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Membros do departamento
      </p>

      {activeUsers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum usuário ativo na instituição.
        </p>
      ) : (
        <div className="grid gap-1 max-h-48 overflow-y-auto">
          {activeUsers.map((user) => (
            <label
              key={user.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={memberIds.has(user.id)}
                onChange={() => toggleUser(user.id)}
                className="rounded border-input"
              />
              <span className="truncate">{user.name || user.email}</span>
              <span className="text-xs text-muted-foreground truncate ml-auto">
                {user.email}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="gap-1"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
          className="gap-1"
        >
          <X className="h-3.5 w-3.5" />
          Fechar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DepartamentosPage() {
  const { data } = useOnboarding();
  const isSysAdmin = data.auth?.institutionId === 4;
  const { isOfficeAdmin: isMyOfficeAdmin } = useMyDepartments();
  const canEditDepartments = isSysAdmin || isMyOfficeAdmin;

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    number | undefined
  >(undefined);
  const [institutions, setInstitutions] = useState<
    Array<{ institutionId: number; companyName: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  const {
    departments,
    isLoading,
    error,
    refresh,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    isDepartmentUpdating,
  } = useDepartments(
    data.auth?.institutionId ?? undefined,
    selectedInstitutionId,
  );

  const { users: allUsers } = useUsers(
    data.auth?.institutionId ?? undefined,
    selectedInstitutionId,
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [managingMembersId, setManagingMembersId] = useState<number | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleCreate = useCallback(
    async (form: DeptFormData) => {
      setIsSubmitting(true);
      try {
        await createDepartment({
          name: form.name,
          description: form.description || undefined,
          institutionId: selectedInstitutionId,
        });
        setShowCreateForm(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [createDepartment, selectedInstitutionId],
  );

  const handleUpdate = useCallback(
    async (departmentId: number, form: DeptFormData) => {
      setIsSubmitting(true);
      try {
        await updateDepartment(departmentId, {
          name: form.name,
          description: form.description,
        });
        setEditingId(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [updateDepartment],
  );

  const handleDelete = useCallback(
    async (departmentId: number) => {
      if (!confirm("Desativar este departamento?")) return;
      await deleteDepartment(departmentId);
    },
    [deleteDepartment],
  );

  if (isLoading) {
    return <LoadingScreen message="Carregando departamentos..." />;
  }

  if (!canEditDepartments) {
    return (
      <main className="min-h-screen bg-background py-4">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">
            Acesso restrito
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Apenas administradores podem acessar esta página.
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
              <Building2 className="h-4 w-4" />
              Departamentos
            </h2>
            <p className="text-xs text-muted-foreground">
              {isSysAdmin
                ? selectedInstitutionId
                  ? `Instituição #${selectedInstitutionId}`
                  : "Todas as instituições"
                : "Gerencie os departamentos da sua instituição"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEditDepartments && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(true);
                  setEditingId(null);
                  setManagingMembersId(null);
                }}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Novo Departamento</span>
              </Button>
            )}
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
              <option value="">Todas</option>
              {institutions.map((inst) => (
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

        {/* Create Form */}
        {showCreateForm && (
          <div className="border-b border-[#7E99B5] dark:border-border/60">
            <div className="px-4 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Novo Departamento
              </p>
            </div>
            <DeptForm
              initial={emptyForm}
              isEdit={false}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {/* Departments List */}
        {departments.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum departamento cadastrado.
            </p>
          </div>
        ) : (
          departments.map((dept) => {
            const isEditing = editingId === dept.id;
            const isManagingMembers = managingMembersId === dept.id;
            const updating = isDepartmentUpdating(dept.id);

            if (isEditing) {
              return (
                <div
                  key={dept.id}
                  className="border-b border-[#7E99B5] dark:border-border/60"
                >
                  <div className="px-4 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Editando: {dept.name}
                    </p>
                  </div>
                  <DeptForm
                    initial={{
                      name: dept.name,
                      description: dept.description,
                    }}
                    isEdit
                    onSubmit={(form) => handleUpdate(dept.id, form)}
                    onCancel={() => setEditingId(null)}
                    isSubmitting={isSubmitting}
                  />
                </div>
              );
            }

            return (
              <div
                key={dept.id}
                className="border-b border-[#7E99B5] dark:border-border/60"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div
                    className={`min-w-0 flex-1 ${canEditDepartments ? "cursor-pointer hover:opacity-80" : ""} transition-opacity`}
                    onClick={() => {
                      if (!canEditDepartments) return;
                      setEditingId(dept.id);
                      setShowCreateForm(false);
                      setManagingMembersId(null);
                    }}
                  >
                    <p className="text-sm font-semibold truncate">
                      {dept.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {dept.description || "Sem descrição"}
                      {isSysAdmin && dept.institutionId
                        ? ` | Inst. #${dept.institutionId}`
                        : ""}
                    </p>
                  </div>

                  {canEditDepartments && (
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagingMembersId(
                            isManagingMembers ? null : dept.id,
                          );
                          setEditingId(null);
                          setShowCreateForm(false);
                        }}
                      >
                        <UsersIcon className="h-3.5 w-3.5" />
                        Membros
                        {isManagingMembers ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(dept.id);
                        }}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Members panel */}
                {isManagingMembers && (
                  <MembersManager
                    departmentId={dept.id}
                    allUsers={allUsers}
                    onClose={() => setManagingMembersId(null)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

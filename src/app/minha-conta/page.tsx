"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserCircle,
  Pencil,
  X,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import type { UserPublicRow } from "@/services/permissions";
import { fetchMyProfileClient, updateUserClient } from "@/services/users-client";

export default function MinhaContaPage() {
  const router = useRouter();
  const { data, isHydrated } = useOnboarding();

  const [profile, setProfile] = useState<UserPublicRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode for personal info
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", oab: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const user = await fetchMyProfileClient();
      setProfile(user);
      setEditForm({
        name: user.name,
        email: user.email,
        phone: user.phone,
        oab: user.oab,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar perfil",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    loadProfile();
  }, [isHydrated, data.auth, router, loadProfile]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    if (!editForm.name.trim()) {
      setSaveError("Nome é obrigatório");
      return;
    }
    if (!editForm.email.trim()) {
      setSaveError("E-mail é obrigatório");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const updated = await updateUserClient(profile.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
        oab: editForm.oab.trim() || undefined,
      });
      setProfile(updated);
      setIsEditing(false);
      setSaveMessage("Dados atualizados com sucesso");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Erro ao salvar dados",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!profile) return;
    setEditForm({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      oab: profile.oab,
    });
    setIsEditing(false);
    setSaveError(null);
  };

  const handleSavePassword = async () => {
    if (!profile) return;
    if (!newPassword) {
      setPasswordError("Informe a nova senha");
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError("A senha deve ter pelo menos 4 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem");
      return;
    }

    setIsSavingPassword(true);
    setPasswordError(null);
    setPasswordMessage(null);

    try {
      await updateUserClient(profile.id, { password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
      setPasswordMessage("Senha alterada com sucesso");
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Erro ao alterar senha",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando perfil..." />;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4">
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto flex max-w-5xl flex-col px-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Minha Conta
            </h2>
            <p className="text-xs text-muted-foreground">
              Gerencie suas informações pessoais e senha
            </p>
          </div>
          {!isEditing && !showPasswordSection && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="gap-1"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
          )}
        </div>

        {/* Success messages */}
        {saveMessage && (
          <div className="mx-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200 mt-2">
            {saveMessage}
          </div>
        )}
        {passwordMessage && (
          <div className="mx-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200 mt-2">
            {passwordMessage}
          </div>
        )}

        {/* Personal info section */}
        <div className="border-b border-[#7E99B5] dark:border-border/60">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Informações Pessoais
            </p>
            {isEditing && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="h-7 gap-1 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="h-7 gap-1 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            )}
          </div>

          {saveError && (
            <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 mb-2">
              {saveError}
            </div>
          )}

          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            {isEditing ? (
              <>
                <Input
                  placeholder="Nome"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="E-mail"
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Telefone"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="OAB"
                  value={editForm.oab}
                  onChange={(e) =>
                    setEditForm({ ...editForm, oab: e.target.value })
                  }
                  className="h-9 text-sm"
                />
              </>
            ) : (
              <>
                <InfoField label="Nome" value={profile.name} />
                <InfoField label="E-mail" value={profile.email} />
                <InfoField label="Telefone" value={profile.phone || "—"} />
                <InfoField label="OAB" value={profile.oab || "—"} />
              </>
            )}
          </div>
        </div>

        {/* Role & Status (read-only) */}
        <div className="border-b border-[#7E99B5] dark:border-border/60">
          <div className="px-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Perfil e Status
            </p>
          </div>
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            <InfoField
              label="Perfil"
              value={profile.isOfficeAdmin ? "Admin do Escritório" : "Usuário comum"}
            />
            <InfoField
              label="Status"
              value={profile.isActive ? "Ativo" : "Inativo"}
            />
          </div>
        </div>

        {/* Password section */}
        <div className="border-b border-[#7E99B5] dark:border-border/60">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Senha
            </p>
            {!showPasswordSection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswordSection(true)}
                className="h-7 gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Alterar senha
              </Button>
            )}
          </div>

          {showPasswordSection && (
            <div className="px-4 py-3 space-y-3">
              {passwordError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                  {passwordError}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Input
                    placeholder="Nova senha"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    placeholder="Confirmar nova senha"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSavePassword}
                  disabled={isSavingPassword}
                  className="h-7 gap-1 text-xs"
                >
                  {isSavingPassword ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Salvar senha
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPasswordSection(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordError(null);
                  }}
                  disabled={isSavingPassword}
                  className="h-7 gap-1 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

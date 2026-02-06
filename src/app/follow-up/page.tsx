"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import {
  getFollowUpConfigs,
  createFollowUpConfig,
  updateFollowUpConfig,
  deleteFollowUpConfig,
  type FollowUpConfigRow,
} from "@/services/api";
import { Clock, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";

type DayOfWeek = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: "seg", label: "Segunda" },
  { value: "ter", label: "Terça" },
  { value: "qua", label: "Quarta" },
  { value: "qui", label: "Quinta" },
  { value: "sex", label: "Sexta" },
  { value: "sab", label: "Sábado" },
  { value: "dom", label: "Domingo" },
];

type FollowUpFormData = {
  message_order: number;
  delay_minutes: number;
  message_content: string;
  is_active: boolean;
  allowed_days: DayOfWeek[];
  allowed_start_time: string;
  allowed_end_time: string;
};

const emptyFollowUpForm: FollowUpFormData = {
  message_order: 1,
  delay_minutes: 60,
  message_content: "",
  is_active: true,
  allowed_days: ["seg", "ter", "qua", "qui", "sex"],
  allowed_start_time: "08:00",
  allowed_end_time: "18:00",
};

const MAX_MESSAGES = 10;

export default function FollowUpPage() {
  const router = useRouter();
  const { data, isHydrated } = useOnboarding();

  // Follow-up states
  const [configs, setConfigs] = useState<FollowUpConfigRow[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FollowUpConfigRow | null>(null);
  const [form, setForm] = useState<FollowUpFormData>(emptyFollowUpForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Fetch configs
  const fetchConfigs = useCallback(async () => {
    if (!data.auth?.institutionId) return;

    setIsLoadingConfigs(true);
    setConfigError(null);
    try {
      const result = await getFollowUpConfigs(data.auth.institutionId);
      setConfigs(result);
    } catch (error) {
      console.error("Erro ao buscar configurações de follow-up:", error);
      setConfigError(
        error instanceof Error ? error.message : "Erro ao buscar configurações"
      );
    } finally {
      setIsLoadingConfigs(false);
    }
  }, [data.auth?.institutionId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }
    fetchConfigs();
  }, [isHydrated, data.auth, router, fetchConfigs]);

  const parseAllowedDays = (value: string | undefined): DayOfWeek[] => {
    if (!value) return ["seg", "ter", "qua", "qui", "sex"];
    return value.split(",").map((d) => d.trim().toLowerCase() as DayOfWeek).filter(Boolean);
  };

  const isConfigActive = (value: string | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return ["sim", "yes", "true", "1", "ativo"].includes(normalized);
  };

  const handleOpenDialog = (config?: FollowUpConfigRow) => {
    if (config) {
      setEditingConfig(config);
      setForm({
        message_order: config.message_order ?? 1,
        delay_minutes: config.delay_minutes ?? 60,
        message_content: config.message_content ?? "",
        is_active: isConfigActive(config.is_active),
        allowed_days: parseAllowedDays(config.allowed_days),
        allowed_start_time: config.allowed_start_time ?? "08:00",
        allowed_end_time: config.allowed_end_time ?? "18:00",
      });
    } else {
      setEditingConfig(null);
      // Calcular próximo order
      const nextOrder = configs.length > 0
        ? Math.max(...configs.map((c) => c.message_order ?? 0)) + 1
        : 1;
      setForm({
        ...emptyFollowUpForm,
        message_order: Math.min(nextOrder, MAX_MESSAGES),
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingConfig(null);
    setForm(emptyFollowUpForm);
  };

  const handleDayToggle = (day: DayOfWeek) => {
    setForm((prev) => {
      const days = prev.allowed_days.includes(day)
        ? prev.allowed_days.filter((d) => d !== day)
        : [...prev.allowed_days, day];
      return { ...prev, allowed_days: days };
    });
  };

  const parseTimeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const handleSave = async () => {
    if (!data.auth?.institutionId) return;
    if (!form.message_content.trim()) {
      alert("O conteúdo da mensagem é obrigatório");
      return;
    }
    if (form.allowed_days.length === 0) {
      alert("Selecione pelo menos um dia da semana");
      return;
    }
    if (form.message_order < 1 || form.message_order > MAX_MESSAGES) {
      alert(`A ordem da mensagem deve estar entre 1 e ${MAX_MESSAGES}`);
      return;
    }
    // Validar que horário fim é maior ou igual ao horário início
    const startMinutes = parseTimeToMinutes(form.allowed_start_time);
    const endMinutes = parseTimeToMinutes(form.allowed_end_time);
    if (endMinutes < startMinutes) {
      alert("O horário de fim deve ser maior ou igual ao horário de início");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        institution_id: data.auth.institutionId,
        message_order: form.message_order,
        delay_minutes: form.delay_minutes,
        message_content: form.message_content.trim(),
        is_active: form.is_active ? "sim" : "não",
        allowed_days: form.allowed_days.join(","),
        allowed_start_time: form.allowed_start_time,
        allowed_end_time: form.allowed_end_time,
      };

      if (editingConfig) {
        await updateFollowUpConfig(editingConfig.id, payload);
      } else {
        await createFollowUpConfig(payload);
      }
      await fetchConfigs();
      handleCloseDialog();
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      alert(error instanceof Error ? error.message : "Erro ao salvar configuração");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (configId: number) => {
    if (!confirm("Tem certeza que deseja excluir esta mensagem de follow-up?")) return;

    setDeletingId(configId);
    try {
      await deleteFollowUpConfig(configId);
      await fetchConfigs();
    } catch (error) {
      console.error("Erro ao excluir configuração:", error);
      alert(error instanceof Error ? error.message : "Erro ao excluir configuração");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (config: FollowUpConfigRow) => {
    setTogglingId(config.id);
    try {
      const currentlyActive = isConfigActive(config.is_active);
      await updateFollowUpConfig(config.id, {
        is_active: currentlyActive ? "não" : "sim",
      });
      await fetchConfigs();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
    } finally {
      setTogglingId(null);
    }
  };

  const formatDelayMinutes = (minutes: number | undefined): string => {
    if (!minutes) return "0 min";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  };

  if (!isHydrated || !data.auth) {
    return null;
  }

  const canAddMore = configs.length < MAX_MESSAGES;

  return (
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Follow-up
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Mensagens de Follow-up
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Configure mensagens automáticas para clientes que ainda não concluíram o atendimento.
          </p>
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Configuração de Mensagens
                </CardTitle>
                <CardDescription>
                  Defina até {MAX_MESSAGES} mensagens de follow-up para casos não finalizados
                </CardDescription>
              </div>
              <Button
                onClick={() => handleOpenDialog()}
                size="sm"
                disabled={!canAddMore}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Mensagem
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingConfigs ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-card p-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-full animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : configError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {configError}
              </div>
            ) : configs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-8 text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h4 className="mt-4 font-semibold text-foreground">
                  Nenhuma mensagem configurada
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adicione mensagens de follow-up para engajar clientes que não finalizaram o atendimento.
                </p>
                <Button
                  onClick={() => handleOpenDialog()}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Configurar primeira mensagem
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {configs.map((config) => {
                  const configActive = isConfigActive(config.is_active);
                  const days = parseAllowedDays(config.allowed_days);
                  return (
                    <div
                      key={config.id}
                      className={`rounded-lg border p-4 transition-colors ${
                        configActive
                          ? "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20"
                          : "border-border/60 bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold ${
                                configActive
                                  ? "bg-green-500/10 text-green-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {config.message_order}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                  Após {formatDelayMinutes(config.delay_minutes)} sem resposta
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {config.message_content}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pl-13">
                            <span className="text-xs text-muted-foreground">
                              {config.allowed_start_time} - {config.allowed_end_time}
                            </span>
                            <span className="text-xs text-muted-foreground">|</span>
                            {days.map((day) => (
                              <span
                                key={day}
                                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                              >
                                {day.charAt(0).toUpperCase() + day.slice(1)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={configActive}
                            onCheckedChange={() => handleToggleActive(config)}
                            disabled={togglingId === config.id}
                            aria-label="Ativar/desativar mensagem"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(config)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(config.id)}
                            disabled={deletingId === config.id}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!canAddMore && configs.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Limite máximo de {MAX_MESSAGES} mensagens atingido.
              </div>
            )}

            <Separator className="my-6" />

            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
              <p className="font-semibold">Como funciona</p>
              <ul className="mt-2 text-xs space-y-1 list-disc list-inside">
                <li>As mensagens são enviadas do <strong>número do escritório</strong> (WhatsApp conectado)</li>
                <li>Cada mensagem é enviada após o tempo de espera configurado, desde a última interação do cliente</li>
                <li>Mensagens só são enviadas nos dias e horários permitidos</li>
                <li>Clientes que já atingiram a etapa final não recebem follow-up</li>
                <li>Máximo de {MAX_MESSAGES} mensagens por cliente dentro de 24 horas</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Dialog de Configuração */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? "Editar Mensagem" : "Nova Mensagem de Follow-up"}
              </DialogTitle>
              <DialogDescription>
                Configure quando e como a mensagem será enviada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="message_order">Ordem (1-{MAX_MESSAGES})</Label>
                  <Input
                    id="message_order"
                    type="number"
                    min={1}
                    max={MAX_MESSAGES}
                    value={form.message_order}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        message_order: Math.min(MAX_MESSAGES, Math.max(1, Number(e.target.value) || 1)),
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delay_minutes">Tempo de espera (minutos)</Label>
                  <Input
                    id="delay_minutes"
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="60"
                    value={form.delay_minutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        delay_minutes: Number(e.target.value) || 60,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatDelayMinutes(form.delay_minutes)} desde a última mensagem do cliente
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message_content">Conteúdo da mensagem *</Label>
                <Textarea
                  id="message_content"
                  placeholder="Olá! Notamos que você ainda não concluiu seu atendimento. Podemos ajudar?"
                  value={form.message_content}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      message_content: e.target.value,
                    }))
                  }
                  rows={4}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Dias permitidos</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={form.allowed_days.includes(day.value)}
                        onCheckedChange={() => handleDayToggle(day.value)}
                      />
                      <label
                        htmlFor={`day-${day.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {day.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="allowed_start_time">Horário início</Label>
                  <Input
                    id="allowed_start_time"
                    type="time"
                    value={form.allowed_start_time}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        allowed_start_time: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allowed_end_time">Horário fim</Label>
                  <Input
                    id="allowed_end_time"
                    type="time"
                    value={form.allowed_end_time}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        allowed_end_time: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="is_active">Mensagem ativa</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

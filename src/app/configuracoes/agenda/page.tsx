"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserPlus,
  User,
  Mail,
  Phone,
} from "lucide-react";

import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  addCalendarEventGuestClient,
  createCalendarEventClient,
  deleteCalendarEventClient,
  fetchCalendarEventById,
  fetchCalendarEvents,
  updateCalendarEventClient,
  type CalendarEvent,
  type CalendarEventPayload,
  type CalendarGuestInput,
} from "@/services/calendar-client";
import type { CalendarSettingsRow } from "@/services/calendar-settings";
import {
  fetchCalendarSettingsClient,
  updateCalendarSettingsClient,
} from "@/services/calendar-settings-client";

const formatDateOnly = (date: Date): string => {
  const iso = date.toISOString();
  return iso.slice(0, 10);
};

const dateToLocalInput = (value: Date | string | null | undefined): string => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const localInputToUtc = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida");
  }
  return date.toISOString();
};

const formatEventInterval = (event: CalendarEvent): string => {
  if (!event.start_datetime || !event.end_datetime) {
    return "Horário não definido";
  }

  const timezone = event.timezone || undefined;
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: timezone,
  });

  try {
    const startDate = new Date(event.start_datetime);
    const endDate = new Date(event.end_datetime);
    const sameDay = dateFormatter.format(startDate) === dateFormatter.format(endDate);

    if (sameDay) {
      return `${dateFormatter.format(startDate)} • ${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
    }

    return `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} → ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
  } catch {
    const fallback = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return `${fallback.format(new Date(event.start_datetime))} → ${fallback.format(
      new Date(event.end_datetime),
    )}`;
  }
};

const guestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Informe o nome do convidado"),
  email: z
    .string()
    .email("E-mail inválido")
    .or(z.literal(""))
    .optional(),
  phone: z
    .string()
    .min(6, "Telefone inválido")
    .or(z.literal(""))
    .optional(),
});

const eventFormSchema = z.object({
  title: z.string().min(1, "Informe o título do evento"),
  description: z.string().optional(),
  start: z.string().min(1, "Informe a data inicial"),
  end: z.string().min(1, "Informe a data final"),
  timezone: z.string().min(1, "Informe o timezone"),
  location: z.string().optional(),
  meeting_link: z
    .string()
    .url("Informe uma URL válida")
    .or(z.literal(""))
    .optional(),
  reminderMinutes: z
    .string()
    .optional()
    .refine(
      (value) => !value || /^\d+$/.test(value),
      "Informe um número de minutos válido",
    ),
  notify_by_email: z.boolean(),
  notify_by_phone: z.boolean(),
  guests: z.array(guestSchema),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

type EventFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CalendarEventPayload) => Promise<void>;
  isSubmitting: boolean;
  event?: CalendarEvent | null;
  defaultTimezone: string;
  errorMessage: string | null;
  isLoadingDetails?: boolean;
};

const mapGuestsFromEvent = (event?: CalendarEvent | null): EventFormValues["guests"] => {
  if (!event?.guests?.length) {
    return [];
  }

  return event.guests.map((guest) => ({
    name: guest.name ?? "",
    email: guest.email ?? "",
    phone: guest.phone ?? "",
  }));
};

const buildDefaultFormValues = (
  event: CalendarEvent | null | undefined,
  defaultTimezone: string,
): EventFormValues => {
  if (event) {
    return {
      title: event.title ?? "",
      description: event.description ?? "",
      start: dateToLocalInput(event.start_datetime),
      end: dateToLocalInput(event.end_datetime),
      timezone: event.timezone || defaultTimezone,
      location: event.location ?? "",
      meeting_link: event.meeting_link ?? "",
      reminderMinutes:
        event.reminder_minutes_before !== undefined &&
        event.reminder_minutes_before !== null &&
        !Number.isNaN(Number(event.reminder_minutes_before))
          ? String(Number(event.reminder_minutes_before))
          : "",
      notify_by_email: Boolean(event.notify_by_email ?? true),
      notify_by_phone: Boolean(event.notify_by_phone ?? false),
      guests: mapGuestsFromEvent(event),
    };
  }

  const initialStart = new Date();
  initialStart.setMinutes(initialStart.getMinutes() + 30);
  const initialEnd = new Date(initialStart.getTime() + 60 * 60 * 1000);

  return {
    title: "",
    description: "",
    start: dateToLocalInput(initialStart),
    end: dateToLocalInput(initialEnd),
    timezone: defaultTimezone,
    location: "",
    meeting_link: "",
    reminderMinutes: "",
    notify_by_email: true,
    notify_by_phone: false,
    guests: [],
  };
};

const EventFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  event,
  defaultTimezone,
  errorMessage,
  isLoadingDetails = false,
}: EventFormDialogProps) => {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: buildDefaultFormValues(event, defaultTimezone),
  });
  const {
    fields: guestFields,
    append: appendGuest,
    remove: removeGuest,
  } = useFieldArray({
    control: form.control,
    name: "guests",
  });

  useEffect(() => {
    if (open) {
      form.reset(buildDefaultFormValues(event, defaultTimezone));
    }
  }, [open, event, defaultTimezone, form]);

  const handleAddGuest = () => {
    appendGuest({ name: "", email: "", phone: "" });
  };

  const submitForm = form.handleSubmit(async (values) => {
    const startIso = localInputToUtc(values.start);
    const endIso = localInputToUtc(values.end);
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      form.setError("end", {
        message: "O término deve ser após o início",
      });
      return;
    }

    const payload: CalendarEventPayload = {
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      start_datetime: startIso,
      end_datetime: endIso,
      timezone: values.timezone.trim(),
      location: values.location?.trim() || undefined,
      meeting_link: values.meeting_link?.trim() || undefined,
      reminder_minutes_before: values.reminderMinutes
        ? Number(values.reminderMinutes)
        : undefined,
      notify_by_email: values.notify_by_email,
      notify_by_phone: values.notify_by_phone,
    };

    const guests: CalendarGuestInput[] = values.guests
      .map((guest) => ({
        id: guest.id,
        name: guest.name.trim(),
        email: guest.email?.trim() || undefined,
        phone: guest.phone?.trim() || undefined,
      }))
      .filter((guest) => guest.name.length > 0);

    if (guests.length > 0) {
      payload.guests = guests;
    }

    await onSubmit(payload);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {event ? "Editar evento" : "Novo evento"}
          </DialogTitle>
        </DialogHeader>
        <form className="flex max-h-[75vh] flex-col gap-4" onSubmit={submitForm}>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-hide">
            {isLoadingDetails && (
              <p className="text-xs text-muted-foreground">
                Carregando dados atualizados do evento...
              </p>
            )}
            <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" placeholder="Nome do compromisso" {...form.register("title")} />
              {form.formState.errors.title && (
                <p className="text-sm text-red-500">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Contexto do evento, links, observações..."
                rows={3}
                {...form.register("description")}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start">Início</Label>
                <Input id="start" type="datetime-local" {...form.register("start")} />
                {form.formState.errors.start && (
                  <p className="text-sm text-red-500">{form.formState.errors.start.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Fim</Label>
                <Input id="end" type="datetime-local" {...form.register("end")} />
                {form.formState.errors.end && (
                  <p className="text-sm text-red-500">{form.formState.errors.end.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone (IANA)</Label>
              <Input
                id="timezone"
                placeholder="America/Sao_Paulo"
                {...form.register("timezone")}
              />
              {form.formState.errors.timezone && (
                <p className="text-sm text-red-500">{form.formState.errors.timezone.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Local</Label>
                <Input
                  id="location"
                  placeholder="Sala 3, videoconferência..."
                  {...form.register("location")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting_link">Link da reunião</Label>
                <Input
                  id="meeting_link"
                  placeholder="https://meet..."
                  {...form.register("meeting_link")}
                />
                {form.formState.errors.meeting_link && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.meeting_link.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reminderMinutes">Lembrete (minutos antes)</Label>
                <Input
                  id="reminderMinutes"
                  type="number"
                  min={0}
                  placeholder="30"
                  {...form.register("reminderMinutes")}
                />
                {form.formState.errors.reminderMinutes && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.reminderMinutes.message}
                  </p>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Notificar por e-mail</Label>
                    <p className="text-xs text-muted-foreground">
                      Envia e-mail para participantes internos
                    </p>
                  </div>
                  <Controller
                    control={form.control}
                    name="notify_by_email"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Notificar por WhatsApp</Label>
                    <p className="text-xs text-muted-foreground">
                      Usa o número registrado no evento
                    </p>
                  </div>
                  <Controller
                    control={form.control}
                    name="notify_by_phone"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <Label>Convidados</Label>
                <p className="text-sm text-muted-foreground">
                  Adicione pessoas que devem receber o convite ou lembretes.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddGuest}
                className="mt-2 md:mt-0"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Adicionar convidado
              </Button>
            </div>

            {guestFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum convidado adicionado. Este evento será apenas interno.
              </p>
            )}

            {guestFields.map((field, index) => {
              const errors = form.formState.errors.guests?.[index];
              return (
                <div
                  key={field.id}
                  className="rounded-lg border border-muted bg-muted/20 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Convidado {index + 1}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeGuest(index)}
                    >
                      Remover
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Nome completo"
                          {...form.register(`guests.${index}.name` as const)}
                        />
                      </div>
                      {errors?.name && (
                        <p className="text-xs text-red-500">{errors.name.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="email@exemplo.com"
                          {...form.register(`guests.${index}.email` as const)}
                        />
                      </div>
                      {errors?.email && (
                        <p className="text-xs text-red-500">{errors.email.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp / Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="+55 11 99999-9999"
                          {...form.register(`guests.${index}.phone` as const)}
                        />
                      </div>
                      {errors?.phone && (
                        <p className="text-xs text-red-500">{errors.phone.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {errorMessage && (
              <p className="text-sm text-red-500">{errorMessage}</p>
            )}
          </div>

          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoadingDetails}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {event ? "Salvar alterações" : "Criar evento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

type AgendaFilters = {
  startDate: string;
  endDate: string;
};

const buildInitialFilters = (): AgendaFilters => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 30);

  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end),
  };
};

const normalizeFilterDate = (
  value?: string,
  options?: { isEnd?: boolean },
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  if (options?.isEnd) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date.toISOString();
};

// ---------------------------------------------------------------------------
// Calendar Settings Dialog
// ---------------------------------------------------------------------------

const DAYS = [
  { key: "mon", label: "Segunda-feira" },
  { key: "tue", label: "Terça-feira" },
  { key: "wed", label: "Quarta-feira" },
  { key: "thu", label: "Quinta-feira" },
  { key: "fri", label: "Sexta-feira" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

function CalendarSettingsDialog({
  open,
  onOpenChange,
  settings,
  isLoading,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CalendarSettingsRow | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    scheduling_enabled: false,
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    advance_days: 30,
    mon_start: "09:00", mon_end: "18:00",
    tue_start: "09:00", tue_end: "18:00",
    wed_start: "09:00", wed_end: "18:00",
    thu_start: "09:00", thu_end: "18:00",
    fri_start: "09:00", fri_end: "18:00",
    sat_start: "", sat_end: "",
    sun_start: "", sun_end: "",
    meet_link: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        scheduling_enabled: Boolean(settings.scheduling_enabled),
        slot_duration_minutes: settings.slot_duration_minutes || 30,
        buffer_minutes: settings.buffer_minutes || 0,
        advance_days: settings.advance_days || 30,
        mon_start: settings.mon_start ?? "", mon_end: settings.mon_end ?? "",
        tue_start: settings.tue_start ?? "", tue_end: settings.tue_end ?? "",
        wed_start: settings.wed_start ?? "", wed_end: settings.wed_end ?? "",
        thu_start: settings.thu_start ?? "", thu_end: settings.thu_end ?? "",
        fri_start: settings.fri_start ?? "", fri_end: settings.fri_end ?? "",
        sat_start: settings.sat_start ?? "", sat_end: settings.sat_end ?? "",
        sun_start: settings.sun_start ?? "", sun_end: settings.sun_end ?? "",
        meet_link: settings.meet_link ?? "",
      });
    }
  }, [settings]);

  const updateDay = (day: string, field: "start" | "end", value: string) => {
    setForm((prev) => ({ ...prev, [`${day}_${field}`]: value }));
  };

  const toggleDay = (day: string, enabled: boolean) => {
    if (enabled) {
      setForm((prev) => ({
        ...prev,
        [`${day}_start`]: "09:00",
        [`${day}_end`]: "18:00",
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        [`${day}_start`]: "",
        [`${day}_end`]: "",
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações da Agenda
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Scheduling enabled toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Agendamento por IA</Label>
                <p className="text-xs text-muted-foreground">
                  Permite que o agente de IA realize agendamentos automáticos para esta instituição.
                </p>
              </div>
              <Switch
                checked={form.scheduling_enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, scheduling_enabled: checked }))
                }
              />
            </div>

            {/* Duration & Buffer */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Duração do evento</Label>
                <div className="relative">
                  <select
                    value={form.slot_duration_minutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        slot_duration_minutes: Number(e.target.value),
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm appearance-none pr-7"
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Intervalo entre</Label>
                <div className="relative">
                  <select
                    value={form.buffer_minutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        buffer_minutes: Number(e.target.value),
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm appearance-none pr-7"
                  >
                    {[0, 5, 10, 15, 20, 30].map((d) => (
                      <option key={d} value={d}>
                        {d} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Antecedência máx.</Label>
                <div className="relative">
                  <select
                    value={form.advance_days}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        advance_days: Number(e.target.value),
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm appearance-none pr-7"
                  >
                    {[7, 14, 30, 60, 90].map((d) => (
                      <option key={d} value={d}>
                        {d} dias
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Meet link */}
            <div className="space-y-1">
              <Label className="text-xs">Link da reunião (opcional)</Label>
              <Input
                value={form.meet_link}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, meet_link: e.target.value }))
                }
                placeholder="https://meet.google.com/..."
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Será usado como padrão nos novos agendamentos.
              </p>
            </div>

            {/* Available days */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Horários disponíveis</Label>
              <p className="text-[11px] text-muted-foreground">
                Defina os períodos em que é possível agendar. Desative o dia para marcar como indisponível.
              </p>
              <div className="space-y-2">
                {DAYS.map(({ key, label }) => {
                  const startKey = `${key}_start` as keyof typeof form;
                  const endKey = `${key}_end` as keyof typeof form;
                  const isEnabled = form[startKey] !== "" || form[endKey] !== "";

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0"
                    >
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => toggleDay(key, checked)}
                      />
                      <span className="text-xs font-medium w-28 shrink-0">
                        {label}
                      </span>
                      {isEnabled ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            type="time"
                            value={form[startKey] as string}
                            onChange={(e) => updateDay(key, "start", e.target.value)}
                            className="h-8 text-xs flex-1"
                          />
                          <span className="text-xs text-muted-foreground">às</span>
                          <Input
                            type="time"
                            value={form[endKey] as string}
                            onChange={(e) => updateDay(key, "end", e.target.value)}
                            className="h-8 text-xs flex-1"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Indisponível
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Agenda Page
// ---------------------------------------------------------------------------

const AgendaPage = () => {
  const { data, isHydrated } = useOnboarding();
  const institutionId = data.auth?.institutionId;
  const [filters, setFilters] = useState<AgendaFilters>(buildInitialFilters);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loadingEventDetails, setLoadingEventDetails] = useState(false);

  // Calendar settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [calSettings, setCalSettings] = useState<CalendarSettingsRow | null>(null);

  const resolvedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const fetchEvents = useCallback(
    async (fullScreen = false) => {
      if (!institutionId) {
        setEvents([]);
        return;
      }

      if (fullScreen) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
    try {
      const data = await fetchCalendarEvents({
        institutionId,
        start: normalizeFilterDate(filters.startDate),
        end: normalizeFilterDate(filters.endDate, { isEnd: true }),
      });
      setEvents(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar eventos");
        setEvents([]);
      } finally {
        if (fullScreen) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [institutionId, filters.startDate, filters.endDate],
  );

  useEffect(() => {
    if (!isHydrated) return;
    fetchEvents(true).catch(() => {
      // handled na função
    });
  }, [fetchEvents, isHydrated]);

  const handleRefresh = () => {
    fetchEvents(false).catch(() => {
      // handled
    });
  };

  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const s = await fetchCalendarSettingsClient();
      setCalSettings(s);
    } catch {
      // Will show empty form with defaults
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async (data: Record<string, unknown>) => {
    setSettingsSaving(true);
    try {
      const saved = await updateCalendarSettingsClient(data);
      setCalSettings(saved);
      setIsSettingsOpen(false);
      setFeedback("Configurações da agenda salvas com sucesso");
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingEvent(null);
    setFormError(null);
    setFeedback(null);
    setIsFormOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormError(null);
    setFeedback(null);
    setIsFormOpen(true);
    if (!institutionId) {
      return;
    }
    setLoadingEventDetails(true);
    fetchCalendarEventById(institutionId, event.id)
      .then((fullEvent) => {
        setEditingEvent(fullEvent);
      })
      .catch((error) => {
        console.error("Erro ao carregar detalhes do evento:", error);
        setFormError("Não foi possível carregar os dados completos do evento.");
      })
      .finally(() => setLoadingEventDetails(false));
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
    setLoadingEventDetails(false);
  };

  const handleSubmitEvent = async (payload: CalendarEventPayload) => {
    if (!institutionId) {
      setFormError("Instituição não encontrada. Faça login novamente.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const { guests = [], ...eventPayload } = payload;
      if (editingEvent) {
        await updateCalendarEventClient(institutionId, editingEvent.id, eventPayload);
        const newGuests = guests.filter((guest) => !guest.id);
        if (newGuests.length > 0) {
          await Promise.all(
            newGuests.map((guest) =>
              addCalendarEventGuestClient(institutionId, editingEvent.id, guest),
            ),
          );
        }
        setFeedback("Evento atualizado com sucesso.");
      } else {
        await createCalendarEventClient(institutionId, { ...eventPayload, guests });
        setFeedback("Evento criado com sucesso.");
      }
      closeForm();
      fetchEvents(false).catch(() => {
        // handled
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar evento");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    if (!institutionId) return;
    const confirmed = window.confirm(
      `Confirma a exclusão do evento "${event.title}"?`,
    );
    if (!confirmed) return;

    setDeletingId(event.id);
    setFeedback(null);
    try {
      await deleteCalendarEventClient(institutionId, event.id);
      setFeedback("Evento excluído.");
      fetchEvents(false).catch(() => {
        // handled
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir evento");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isHydrated || loading) {
    return <LoadingScreen message="Carregando agenda..." />;
  }

  if (!institutionId) {
    return (
      <div>
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground">
          Faça login para acessar a agenda do escritório.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Agenda
            </h2>
            <p className="text-xs text-muted-foreground">
              Eventos vinculados ao módulo de agenda
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openSettings} title="Configurações da agenda">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Novo evento
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 px-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data inicial
            </label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, startDate: event.target.value }))
              }
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data final
            </label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, endDate: event.target.value }))
              }
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Eventos
            </label>
            <div className="h-9 flex items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
              {events.length} registro(s)
            </div>
          </div>
        </div>

        {feedback && (
          <div className="mx-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {error && (
          <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Lista de eventos */}
        <div>
          {events.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h4 className="mt-3 text-sm font-semibold text-foreground">
                Nenhum evento encontrado
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum evento para o período selecionado.
              </p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                role="button"
                tabIndex={0}
                onClick={() => openEditModal(event)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                    keyboardEvent.preventDefault();
                    openEditModal(event);
                  }
                }}
                className="cursor-pointer border-b border-[#7E99B5] px-4 py-3 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary dark:border-border/60"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Event info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{event.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {formatEventInterval(event)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      {event.timezone || "UTC"}
                    </span>
                    {event.reminder_minutes_before != null && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                        {event.reminder_minutes_before}min
                      </span>
                    )}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        event.notify_by_email
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      Email
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        event.notify_by_phone
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      WhatsApp
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deletingId === event.id}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        handleDeleteEvent(event);
                      }}
                    >
                      {deletingId === event.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Extra info row */}
                {(event.location || event.meeting_link) && (
                  <div className="flex flex-wrap gap-3 mt-1 ml-0 text-xs text-muted-foreground">
                    {event.location && <span>Local: {event.location}</span>}
                    {event.meeting_link && (
                      <a
                        href={event.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline truncate max-w-[300px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.meeting_link}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <EventFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeForm();
          } else {
            setIsFormOpen(true);
          }
        }}
        event={editingEvent}
        defaultTimezone={resolvedTimezone}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitEvent}
        errorMessage={formError}
        isLoadingDetails={loadingEventDetails}
      />

      {/* Calendar Settings Dialog */}
      <CalendarSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        settings={calSettings}
        isLoading={settingsLoading}
        isSaving={settingsSaving}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default AgendaPage;

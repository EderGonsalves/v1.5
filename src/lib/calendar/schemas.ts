import { z } from "zod";

const isUtcISOString = (value: string): boolean => {
  if (!value || typeof value !== "string") {
    return false;
  }
  if (!value.endsWith("Z")) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const optionalText = z
  .union([z.string(), z.literal(""), z.undefined()])
  .transform((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  });

const optionalUrl = z
  .union([z.string().url("Informe uma URL vÃ¡lida"), z.literal(""), z.undefined()])
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const optionalEmail = z
  .union([z.string().email("Informe um e-mail vÃ¡lido"), z.literal(""), z.undefined()])
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const optionalPhone = z
  .union([z.string().min(6, "Informe um telefone vÃ¡lido"), z.literal(""), z.undefined()])
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const utcDateTime = z

  .string()

  .min(1, "Campo obrigatório")

  .refine(isUtcISOString, {

    message: "Use um datetime UTC no formato ISO 8601 (ex: 2026-02-10T13:00:00Z)",

  });



const optionalUtcDateTime = z
  .union([utcDateTime, z.literal(""), z.undefined()])
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    return value;
  });


export const calendarGuestSchema = z.object({
  name: z.string().min(1, "Nome do convidado Ã© obrigatÃ³rio").trim(),
  email: optionalEmail,
  phone: optionalPhone,
});

export type CalendarGuestInput = z.infer<typeof calendarGuestSchema>;

export const calendarEventInputSchema = z
  .object({
    title: z.string().min(1, "TÃ­tulo Ã© obrigatÃ³rio").trim(),
    description: optionalText,
    start_datetime: utcDateTime,
    end_datetime: utcDateTime,
    timezone: z.string().min(1, "Informe o timezone do evento").trim(),
    location: optionalText,
    meeting_link: optionalUrl,
    reminder_minutes_before: z
      .coerce.number()
      .int("Use um nÃºmero inteiro")
      .min(0, "Use valores maiores ou iguais a zero")
      .optional(),
    notify_by_email: z.coerce.boolean().optional(),
    notify_by_phone: z.coerce.boolean().optional(),
    user_id: z.coerce.number().int().optional(),
    google_event_id: optionalText,
    sync_status: optionalText,
    deleted_at: optionalUtcDateTime,
    guests: z.array(calendarGuestSchema).default([]),
  })
  .refine(
    (data) =>
      Date.parse(data.end_datetime) >= Date.parse(data.start_datetime),
    {
      message: "end_datetime deve ser maior ou igual a start_datetime",
      path: ["end_datetime"],
    },
  );

export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

export const calendarEventUpdateSchema = calendarEventInputSchema
  .omit({ guests: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizaÃ§Ã£o",
  });

export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateSchema>;

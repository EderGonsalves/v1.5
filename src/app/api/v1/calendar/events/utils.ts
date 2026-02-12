import type {
  CalendarEventGuestRow,
  CalendarEventRow,
} from "@/services/api";

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    return false;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return Boolean(value);
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Date formatting (pt-BR)
// ---------------------------------------------------------------------------

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const timeOnlyFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const formatDateTime = (value: unknown): string | null => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateTimeFormatter.format(date);
};

const formatDateOnly = (value: unknown): string | null => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateOnlyFormatter.format(date);
};

const formatTimeOnly = (value: unknown): string | null => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return timeOnlyFormatter.format(date);
};

// ---------------------------------------------------------------------------
// Guest serialization
// ---------------------------------------------------------------------------

const mapGuests = (
  guests?: CalendarEventGuestRow[],
): Array<{
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
}> => {
  if (!guests?.length) {
    return [];
  }
  return guests.map((guest) => ({
    id: guest.id,
    name: guest.name ?? "",
    email: guest.email,
    phone: guest.phone,
  }));
};

// ---------------------------------------------------------------------------
// Event serialization
// ---------------------------------------------------------------------------

export const serializeEvent = (
  event: CalendarEventRow,
  guests?: CalendarEventGuestRow[],
) => ({
  id: event.id,
  title: event.title,
  description: event.description,
  start_datetime: event.start_datetime,
  end_datetime: event.end_datetime,
  start_formatted: formatDateTime(event.start_datetime),
  end_formatted: formatDateTime(event.end_datetime),
  date_formatted: formatDateOnly(event.start_datetime),
  start_time: formatTimeOnly(event.start_datetime),
  end_time: formatTimeOnly(event.end_datetime),
  timezone: event.timezone,
  location: event.location,
  meeting_link: event.meeting_link,
  reminder_minutes_before: toNumber(event.reminder_minutes_before),
  notify_by_email: toBoolean(event.notify_by_email),
  notify_by_phone: toBoolean(event.notify_by_phone),
  created_at: event.created_at,
  updated_at: event.updated_at,
  guests: guests ? mapGuests(guests) : [],
});

export const toTextFlag = (value?: boolean): string | undefined => {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value ? "true" : "false";
};

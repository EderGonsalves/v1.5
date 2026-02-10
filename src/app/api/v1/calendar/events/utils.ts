import type {
  CalendarEventGuestRow,
  CalendarEventRow,
} from "@/services/api";

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

export const serializeEvent = (
  event: CalendarEventRow,
  guests?: CalendarEventGuestRow[],
) => ({
  id: event.id,
  title: event.title,
  description: event.description,
  start_datetime: event.start_datetime,
  end_datetime: event.end_datetime,
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

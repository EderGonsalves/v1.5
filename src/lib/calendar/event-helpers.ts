import type { CalendarEventRow } from "@/services/api";

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

export const getEventInstitutionId = (
  event: CalendarEventRow | null,
): number | null => {
  if (!event) {
    return null;
  }

  const direct =
    toNumber(event.InstitutionID) ??
    toNumber((event as Record<string, unknown>).institution_id);
  if (direct !== null) {
    return direct;
  }

  return toNumber(
    (event as Record<string, unknown>)["body.auth.institutionId"],
  );
};

export const eventBelongsToInstitution = (
  event: CalendarEventRow | null,
  institutionId: number,
): boolean => {
  const eventInstitutionId = getEventInstitutionId(event);
  if (eventInstitutionId === null) {
    return false;
  }
  return Number(eventInstitutionId) === Number(institutionId);
};

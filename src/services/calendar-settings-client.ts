import type { CalendarSettingsRow } from "@/services/calendar-settings";

export async function fetchCalendarSettingsClient(
  userId?: number,
): Promise<CalendarSettingsRow | null> {
  const params = userId ? `?userId=${userId}` : "";
  const res = await fetch(`/api/v1/calendar/settings${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.settings ?? null;
}

export async function updateCalendarSettingsClient(
  data: Record<string, unknown>,
  userId?: number,
): Promise<CalendarSettingsRow> {
  const params = userId ? `?userId=${userId}` : "";
  const res = await fetch(`/api/v1/calendar/settings${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const result = await res.json();
  return result.settings;
}

export async function deleteUserCalendarSettingsClient(
  userId: number,
): Promise<boolean> {
  const res = await fetch(`/api/v1/calendar/settings?userId=${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const result = await res.json();
  return result.deleted === true;
}

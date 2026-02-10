import type { CalendarSettingsRow } from "@/services/calendar-settings";

export async function fetchCalendarSettingsClient(): Promise<CalendarSettingsRow | null> {
  const res = await fetch("/api/v1/calendar/settings");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.settings ?? null;
}

export async function updateCalendarSettingsClient(
  data: Record<string, unknown>,
): Promise<CalendarSettingsRow> {
  const res = await fetch("/api/v1/calendar/settings", {
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

import axios from "axios";

// ---------------------------------------------------------------------------
// Baserow config
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const DEFAULT_TABLE_ID = 246;

const TABLE_ID =
  Number(
    process.env.BASEROW_CALENDAR_SETTINGS_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CALENDAR_SETTINGS_TABLE_ID ??
      DEFAULT_TABLE_ID,
  ) || DEFAULT_TABLE_ID;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarSettingsRow = {
  id: number;
  institution_id: number;
  scheduling_enabled: boolean;
  slot_duration_minutes: number;
  buffer_minutes: number;
  advance_days: number;
  mon_start: string;
  mon_end: string;
  tue_start: string;
  tue_end: string;
  wed_start: string;
  wed_end: string;
  thu_start: string;
  thu_end: string;
  fri_start: string;
  fri_end: string;
  sat_start: string;
  sat_end: string;
  sun_start: string;
  sun_end: string;
  meet_link: string;
  created_at: string;
  updated_at: string;
};

export type CalendarSettingsInput = Omit<
  CalendarSettingsRow,
  "id" | "created_at" | "updated_at"
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureEnv = () => {
  if (!BASEROW_API_URL) throw new Error("BASEROW_API_URL não configurado");
  if (!BASEROW_API_KEY) throw new Error("BASEROW_API_KEY não configurado");
};

const baserowClient = () => {
  ensureEnv();
  return axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function fetchCalendarSettings(
  institutionId: number,
): Promise<CalendarSettingsRow | null> {
  const client = baserowClient();
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  params.append("filter__institution_id__equal", String(institutionId));

  const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
  const response = await client.get<{ results?: CalendarSettingsRow[] }>(url);
  const rows = response.data.results ?? [];
  return rows[0] ?? null;
}

export async function upsertCalendarSettings(
  institutionId: number,
  data: Partial<CalendarSettingsInput>,
): Promise<CalendarSettingsRow> {
  const existing = await fetchCalendarSettings(institutionId);
  const now = new Date().toISOString();

  if (existing) {
    // Update
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_ID}/${existing.id}/?user_field_names=true`;
    const payload: Record<string, unknown> = { ...data, updated_at: now };
    const response = await client.patch<CalendarSettingsRow>(url, payload);
    return response.data;
  } else {
    // Create with defaults
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_ID}/?user_field_names=true`;
    const defaults: Record<string, unknown> = {
      institution_id: institutionId,
      scheduling_enabled: false,
      slot_duration_minutes: 30,
      buffer_minutes: 0,
      advance_days: 30,
      mon_start: "09:00",
      mon_end: "18:00",
      tue_start: "09:00",
      tue_end: "18:00",
      wed_start: "09:00",
      wed_end: "18:00",
      thu_start: "09:00",
      thu_end: "18:00",
      fri_start: "09:00",
      fri_end: "18:00",
      sat_start: "",
      sat_end: "",
      sun_start: "",
      sun_end: "",
      meet_link: "",
      created_at: now,
      updated_at: now,
      ...data,
    };
    const response = await client.post<CalendarSettingsRow>(url, defaults);
    return response.data;
  }
}

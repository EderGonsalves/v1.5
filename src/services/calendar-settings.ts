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
  user_id?: number | null;
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

/**
 * Fetch calendar settings for an institution, optionally for a specific user.
 * When userId is provided, tries user-specific settings first, then falls back
 * to institutional settings (user_id IS NULL).
 */
export async function fetchCalendarSettings(
  institutionId: number,
  userId?: number,
): Promise<CalendarSettingsRow | null> {
  const client = baserowClient();

  if (userId) {
    // Try user-specific settings first
    const userParams = new URLSearchParams({
      user_field_names: "true",
      size: "1",
    });
    userParams.append("filter__institution_id__equal", String(institutionId));
    userParams.append("filter__user_id__equal", String(userId));

    const userUrl = `/database/rows/table/${TABLE_ID}/?${userParams.toString()}`;
    const userResponse = await client.get<{ results?: CalendarSettingsRow[] }>(userUrl);
    const userRows = userResponse.data.results ?? [];
    if (userRows[0]) return userRows[0];
  }

  // Institutional settings (user_id is empty/null)
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "10",
  });
  params.append("filter__institution_id__equal", String(institutionId));

  const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
  const response = await client.get<{ results?: CalendarSettingsRow[] }>(url);
  const rows = response.data.results ?? [];
  // Return the row without user_id (institutional default)
  const institutional = rows.find(
    (r) => r.user_id === null || r.user_id === undefined || r.user_id === 0,
  );
  return institutional ?? rows[0] ?? null;
}

export async function upsertCalendarSettings(
  institutionId: number,
  data: Partial<CalendarSettingsInput>,
  userId?: number,
): Promise<CalendarSettingsRow> {
  const client = baserowClient();
  const now = new Date().toISOString();

  // Find existing row matching institution + user
  let existing: CalendarSettingsRow | null = null;
  if (userId) {
    const userParams = new URLSearchParams({
      user_field_names: "true",
      size: "1",
    });
    userParams.append("filter__institution_id__equal", String(institutionId));
    userParams.append("filter__user_id__equal", String(userId));
    const userUrl = `/database/rows/table/${TABLE_ID}/?${userParams.toString()}`;
    const userResponse = await client.get<{ results?: CalendarSettingsRow[] }>(userUrl);
    const userRows = userResponse.data.results ?? [];
    existing = userRows[0] ?? null;
  } else {
    // Find institutional row (no user_id)
    const params = new URLSearchParams({
      user_field_names: "true",
      size: "10",
    });
    params.append("filter__institution_id__equal", String(institutionId));
    const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
    const response = await client.get<{ results?: CalendarSettingsRow[] }>(url);
    const rows = response.data.results ?? [];
    existing = rows.find(
      (r) => r.user_id === null || r.user_id === undefined || r.user_id === 0,
    ) ?? null;
  }

  if (existing) {
    // Update
    const url = `/database/rows/table/${TABLE_ID}/${existing.id}/?user_field_names=true`;
    const payload: Record<string, unknown> = { ...data, updated_at: now };
    const response = await client.patch<CalendarSettingsRow>(url, payload);
    return response.data;
  } else {
    // Create with defaults
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
    if (userId) {
      defaults.user_id = userId;
    }
    const response = await client.post<CalendarSettingsRow>(url, defaults);
    return response.data;
  }
}

/**
 * Delete user-specific settings row, reverting to institutional defaults.
 */
export async function deleteUserCalendarSettings(
  institutionId: number,
  userId: number,
): Promise<boolean> {
  const client = baserowClient();
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "1",
  });
  params.append("filter__institution_id__equal", String(institutionId));
  params.append("filter__user_id__equal", String(userId));

  const url = `/database/rows/table/${TABLE_ID}/?${params.toString()}`;
  const response = await client.get<{ results?: CalendarSettingsRow[] }>(url);
  const rows = response.data.results ?? [];
  if (rows[0]) {
    await client.delete(`/database/rows/table/${TABLE_ID}/${rows[0].id}/`);
    return true;
  }
  return false;
}

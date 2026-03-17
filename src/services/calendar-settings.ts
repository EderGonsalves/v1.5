import { db } from "@/lib/db";
import { calendarSettings } from "@/lib/db/schema/calendarSettings";
import { eq, and, isNull } from "drizzle-orm";

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
// Helpers — map Drizzle row to CalendarSettingsRow
// ---------------------------------------------------------------------------

type DrizzleRow = typeof calendarSettings.$inferSelect;

const toRow = (r: DrizzleRow): CalendarSettingsRow => ({
  id: r.id,
  institution_id: Number(r.institutionId) || 0,
  scheduling_enabled: Boolean(r.schedulingEnabled),
  slot_duration_minutes: Number(r.slotDurationMinutes) || 30,
  buffer_minutes: Number(r.bufferMinutes) || 0,
  advance_days: Number(r.advanceDays) || 30,
  mon_start: r.monStart ?? "",
  mon_end: r.monEnd ?? "",
  tue_start: r.tueStart ?? "",
  tue_end: r.tueEnd ?? "",
  wed_start: r.wedStart ?? "",
  wed_end: r.wedEnd ?? "",
  thu_start: r.thuStart ?? "",
  thu_end: r.thuEnd ?? "",
  fri_start: r.friStart ?? "",
  fri_end: r.friEnd ?? "",
  sat_start: r.satStart ?? "",
  sat_end: r.satEnd ?? "",
  sun_start: r.sunStart ?? "",
  sun_end: r.sunEnd ?? "",
  meet_link: r.meetLink ?? "",
  created_at: r.createdAt ?? "",
  updated_at: r.updatedAt ?? "",
  user_id: r.userId ? Number(r.userId) : null,
});

// ---------------------------------------------------------------------------
// CRUD — direct PostgreSQL via Drizzle ORM
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
  if (userId) {
    // Try user-specific settings first
    const userRows = await db
      .select()
      .from(calendarSettings)
      .where(
        and(
          eq(calendarSettings.institutionId, String(institutionId)),
          eq(calendarSettings.userId, String(userId)),
        ),
      )
      .limit(1);

    if (userRows[0]) return toRow(userRows[0]);
  }

  // Institutional settings (user_id IS NULL)
  const rows = await db
    .select()
    .from(calendarSettings)
    .where(
      and(
        eq(calendarSettings.institutionId, String(institutionId)),
        isNull(calendarSettings.userId),
      ),
    )
    .limit(1);

  return rows[0] ? toRow(rows[0]) : null;
}

export async function upsertCalendarSettings(
  institutionId: number,
  data: Partial<CalendarSettingsInput>,
  userId?: number,
): Promise<CalendarSettingsRow> {
  const now = new Date().toISOString();

  // Build the set of columns to write
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cols: Record<string, any> = {};
  if ("scheduling_enabled" in data) cols.schedulingEnabled = Boolean(data.scheduling_enabled);
  if ("slot_duration_minutes" in data) cols.slotDurationMinutes = String(data.slot_duration_minutes);
  if ("buffer_minutes" in data) cols.bufferMinutes = String(data.buffer_minutes);
  if ("advance_days" in data) cols.advanceDays = String(data.advance_days);
  if ("mon_start" in data) cols.monStart = data.mon_start ?? "";
  if ("mon_end" in data) cols.monEnd = data.mon_end ?? "";
  if ("tue_start" in data) cols.tueStart = data.tue_start ?? "";
  if ("tue_end" in data) cols.tueEnd = data.tue_end ?? "";
  if ("wed_start" in data) cols.wedStart = data.wed_start ?? "";
  if ("wed_end" in data) cols.wedEnd = data.wed_end ?? "";
  if ("thu_start" in data) cols.thuStart = data.thu_start ?? "";
  if ("thu_end" in data) cols.thuEnd = data.thu_end ?? "";
  if ("fri_start" in data) cols.friStart = data.fri_start ?? "";
  if ("fri_end" in data) cols.friEnd = data.fri_end ?? "";
  if ("sat_start" in data) cols.satStart = data.sat_start ?? "";
  if ("sat_end" in data) cols.satEnd = data.sat_end ?? "";
  if ("sun_start" in data) cols.sunStart = data.sun_start ?? "";
  if ("sun_end" in data) cols.sunEnd = data.sun_end ?? "";
  if ("meet_link" in data) cols.meetLink = data.meet_link ?? "";
  cols.updatedAt = now;

  // Find existing row
  let existing: DrizzleRow | undefined;

  if (userId) {
    const rows = await db
      .select()
      .from(calendarSettings)
      .where(
        and(
          eq(calendarSettings.institutionId, String(institutionId)),
          eq(calendarSettings.userId, String(userId)),
        ),
      )
      .limit(1);
    existing = rows[0];
  } else {
    const rows = await db
      .select()
      .from(calendarSettings)
      .where(
        and(
          eq(calendarSettings.institutionId, String(institutionId)),
          isNull(calendarSettings.userId),
        ),
      )
      .limit(1);
    existing = rows[0];
  }

  if (existing) {
    // Update
    const updated = await db
      .update(calendarSettings)
      .set(cols)
      .where(eq(calendarSettings.id, existing.id))
      .returning();
    return toRow(updated[0]);
  }

  // Create with defaults
  const inserted = await db
    .insert(calendarSettings)
    .values({
      order: "99999.00000000000000000000",
      createdOn: new Date(),
      updatedOn: new Date(),
      trashed: false,
      institutionId: String(institutionId),
      schedulingEnabled: false,
      slotDurationMinutes: "30",
      bufferMinutes: "0",
      advanceDays: "30",
      monStart: "09:00",
      monEnd: "18:00",
      tueStart: "09:00",
      tueEnd: "18:00",
      wedStart: "09:00",
      wedEnd: "18:00",
      thuStart: "09:00",
      thuEnd: "18:00",
      friStart: "09:00",
      friEnd: "18:00",
      satStart: "",
      satEnd: "",
      sunStart: "",
      sunEnd: "",
      meetLink: "",
      createdAt: now,
      updatedAt: now,
      userId: userId ? String(userId) : null,
      // Apply overrides from data
      ...(cols as Record<string, unknown>),
    })
    .returning();

  return toRow(inserted[0]);
}

/**
 * Delete user-specific settings row, reverting to institutional defaults.
 */
export async function deleteUserCalendarSettings(
  institutionId: number,
  userId: number,
): Promise<boolean> {
  const result = await db
    .delete(calendarSettings)
    .where(
      and(
        eq(calendarSettings.institutionId, String(institutionId)),
        eq(calendarSettings.userId, String(userId)),
      ),
    )
    .returning();

  return result.length > 0;
}

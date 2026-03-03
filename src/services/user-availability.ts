import { listCalendarEvents, type CalendarEventRow } from "@/services/api";
import { fetchCalendarSettings, type CalendarSettingsRow } from "@/services/calendar-settings";
import type { UserPublicRow } from "@/services/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserAvailabilityInfo = {
  available: boolean;
  nextSlotStart?: string; // ISO datetime of next free slot (if currently busy)
};

export type UserAvailabilityMap = Map<number, UserAvailabilityInfo>;

/** Event pre-parsed to ms timestamps for fast overlap checks */
type EventRange = {
  userId: number;
  startMs: number;
  endMs: number;
};

// ---------------------------------------------------------------------------
// Timezone-aware helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

/**
 * Convert a UTC Date to local date components using Intl.DateTimeFormat.
 * This is the same approach used by /api/v1/calendar/availability.
 */
function toLocalComponents(
  date: Date,
  timezone: string,
): { dateStr: string; dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  // Intl may return hour "24" for midnight; normalise to 0
  const minutes = (hour === 24 ? 0 : hour) * 60 + Number(get("minute"));

  // Map weekday short name to index (Sun=0..Sat=6)
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekdayShort = get("weekday");
  const dayIndex = weekdayMap[weekdayShort] ?? new Date(dateStr).getDay();

  return { dateStr, dayIndex, minutes };
}

/** Parse "HH:MM" to minutes since midnight. Returns null for empty/invalid. */
const parseTimeToMinutes = (time: string | undefined | null): number | null => {
  if (!time || !time.trim()) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

// ---------------------------------------------------------------------------
// Working hours check
// ---------------------------------------------------------------------------

/**
 * Check if a given time is within the working hours for a specific day.
 * Returns false if the day has no configured hours (empty start/end).
 */
export const isWithinWorkingHours = (
  settings: CalendarSettingsRow,
  dayKey: DayKey,
  currentMinutes: number,
): boolean => {
  const startField = `${dayKey}_start` as keyof CalendarSettingsRow;
  const endField = `${dayKey}_end` as keyof CalendarSettingsRow;

  const startMin = parseTimeToMinutes(settings[startField] as string);
  const endMin = parseTimeToMinutes(settings[endField] as string);

  if (startMin === null || endMin === null) return false;
  return currentMinutes >= startMin && currentMinutes < endMin;
};

// ---------------------------------------------------------------------------
// Active event check (uses pre-parsed ranges)
// ---------------------------------------------------------------------------

/** Check if a user has an active event at the given timestamp (ms) */
export const hasActiveEvent = (
  ranges: EventRange[],
  userId: number,
  nowMs: number,
): boolean => {
  return ranges.some(
    (r) => r.userId === userId && r.startMs <= nowMs && nowMs < r.endMs,
  );
};

// ---------------------------------------------------------------------------
// Pre-parse events to ms timestamps (done once per batch)
// ---------------------------------------------------------------------------

function parseEventRanges(events: CalendarEventRow[]): EventRange[] {
  const result: EventRange[] = [];
  for (const e of events) {
    const uid = Number(e.user_id);
    if (!uid || !e.start_datetime || !e.end_datetime) continue;
    const startMs = new Date(e.start_datetime).getTime();
    const endMs = new Date(e.end_datetime).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    result.push({ userId: uid, startMs, endMs });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Next free slot calculation
// ---------------------------------------------------------------------------

/** Get working-hours start/end in minutes for a given day, or null if day off */
const getDayBounds = (
  settings: CalendarSettingsRow,
  dayKey: DayKey,
): { startMin: number; endMin: number } | null => {
  const startField = `${dayKey}_start` as keyof CalendarSettingsRow;
  const endField = `${dayKey}_end` as keyof CalendarSettingsRow;
  const s = parseTimeToMinutes(settings[startField] as string);
  const e = parseTimeToMinutes(settings[endField] as string);
  if (s === null || e === null || s >= e) return null;
  return { startMin: s, endMin: e };
};

/** Check if any event range overlaps [slotStartMs, slotEndMs) */
const slotHasOverlap = (
  ranges: EventRange[],
  slotStartMs: number,
  slotEndMs: number,
): boolean => {
  return ranges.some(
    (r) => r.startMs < slotEndMs && r.endMs > slotStartMs,
  );
};

/**
 * Find the next free slot within working hours and without event overlap.
 * Scans from `now` forward in `slot_duration_minutes` increments.
 * Uses timezone-aware date math via Intl.
 * Returns ISO string or undefined if no slot found within maxDays.
 */
export const findNextFreeSlot = (
  settings: CalendarSettingsRow,
  userRanges: EventRange[],
  now: Date,
  maxDays: number,
  timezone: string,
): string | undefined => {
  const slotDuration = settings.slot_duration_minutes || 30;
  const slotMs = slotDuration * 60_000;

  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + maxDays);
  const endMs = endDate.getTime();

  const nowLocal = toLocalComponents(now, timezone);

  for (let day = 0; day < maxDays; day++) {
    // Advance date in UTC by `day` days then get local components
    const scanUtc = new Date(now);
    scanUtc.setDate(scanUtc.getDate() + day);
    const local = day === 0 ? nowLocal : toLocalComponents(scanUtc, timezone);

    const dayKey = DAY_KEYS[local.dayIndex];
    const bounds = getDayBounds(settings, dayKey);
    if (!bounds) continue; // day off

    // Determine scan start for this day
    let scanStartMin: number;
    if (day === 0) {
      scanStartMin = Math.max(local.minutes, bounds.startMin);
      // Snap to next slot boundary
      const offset = scanStartMin - bounds.startMin;
      const remainder = offset % slotDuration;
      if (remainder > 0) {
        scanStartMin += slotDuration - remainder;
      }
    } else {
      scanStartMin = bounds.startMin;
    }

    // Scan slots within this day's working hours
    for (let min = scanStartMin; min + slotDuration <= bounds.endMin; min += slotDuration) {
      // Build the slot datetime: local date + HH:MM interpreted as local timezone
      const hh = String(Math.floor(min / 60)).padStart(2, "0");
      const mm = String(min % 60).padStart(2, "0");
      // Create a Date from the local date/time string interpreted in the target timezone
      // Use a formatter round-trip: build the ISO-like string and offset-adjust
      const naiveIso = `${local.dateStr}T${hh}:${mm}:00`;
      const slotDate = localToUtcDate(naiveIso, timezone);

      if (slotDate.getTime() >= endMs) return undefined;

      const slotStartMs = slotDate.getTime();
      const slotEndMs = slotStartMs + slotMs;

      if (!slotHasOverlap(userRanges, slotStartMs, slotEndMs)) {
        return slotDate.toISOString();
      }
    }
  }

  return undefined;
};

/**
 * Convert a "YYYY-MM-DDTHH:mm:ss" string (in the given timezone) to a UTC Date.
 * Uses a binary-search approach to find the UTC offset via Intl.
 */
function localToUtcDate(naiveIso: string, timezone: string): Date {
  // Parse naive date components
  const [datePart, timePart] = naiveIso.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = (timePart || "00:00:00").split(":").map(Number);

  // Start with a rough UTC guess
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s || 0));

  // Get the offset at this guess by comparing local representation
  const local = toLocalComponents(guess, timezone);
  const diffMin = (h * 60 + mi) - local.minutes;

  // Adjust by the difference (handles DST within ±1 day accuracy)
  const adjusted = new Date(guess.getTime() + diffMin * 60_000);

  // Verify and fine-tune (handle DST edge where first guess crosses a boundary)
  const verify = toLocalComponents(adjusted, timezone);
  const drift = (h * 60 + mi) - verify.minutes;
  if (drift !== 0) {
    return new Date(adjusted.getTime() + drift * 60_000);
  }

  return adjusted;
}

// ---------------------------------------------------------------------------
// Batch availability check (main entry point)
// ---------------------------------------------------------------------------

/**
 * Check availability for a batch of users.
 * - Users without agendaEnabled are always available (retrocompatibility).
 * - Makes 1 batch call for events + N parallel calls for settings.
 * - Individual settings failures are handled per-user (not atomic).
 * - If the events call fails, all users are treated as available (fallback).
 */
export const checkBatchAvailability = async (
  users: UserPublicRow[],
  institutionId: number,
  timezone: string = DEFAULT_TIMEZONE,
): Promise<UserAvailabilityMap> => {
  const result: UserAvailabilityMap = new Map();
  const now = new Date();
  const nowMs = now.getTime();

  // Separate users by agendaEnabled
  const agendaUsers = users.filter((u) => u.agendaEnabled);
  const nonAgendaUsers = users.filter((u) => !u.agendaEnabled);

  // Non-agenda users are always available
  for (const u of nonAgendaUsers) {
    result.set(u.id, { available: true });
  }

  if (agendaUsers.length === 0) return result;

  try {
    // 1 batch call: fetch ALL events for the institution (now-1h to now+30d)
    const lookbackStart = new Date(now);
    lookbackStart.setHours(lookbackStart.getHours() - 1);

    const lookAheadEnd = new Date(now);
    lookAheadEnd.setDate(lookAheadEnd.getDate() + 30);

    // Fetch events + settings in parallel; use allSettled for settings
    // so one user's failure doesn't break all others
    const [eventsResult, ...settingsSettled] = await Promise.all([
      listCalendarEvents({
        institutionId,
        start: lookbackStart.toISOString(),
        end: lookAheadEnd.toISOString(),
      }),
      ...agendaUsers.map((u) =>
        fetchCalendarSettings(institutionId, u.id)
          .catch((err) => {
            console.error(`[user-availability] Erro ao buscar settings do user ${u.id}:`, err);
            return null; // individual fallback
          }),
      ),
    ]);

    // Pre-parse all event timestamps once
    const allRanges = parseEventRanges(eventsResult);

    // Get current local time components (timezone-aware)
    const nowLocal = toLocalComponents(now, timezone);
    const dayKey = DAY_KEYS[nowLocal.dayIndex];
    const currentMinutes = nowLocal.minutes;

    // Process each agenda user
    for (let i = 0; i < agendaUsers.length; i++) {
      const user = agendaUsers[i];
      const settings = settingsSettled[i];

      // No settings (or fetch failed) → treat as always available
      if (!settings) {
        result.set(user.id, { available: true });
        continue;
      }

      const inWorkingHours = isWithinWorkingHours(settings, dayKey, currentMinutes);
      const hasBusyEvent = hasActiveEvent(allRanges, user.id, nowMs);

      if (inWorkingHours && !hasBusyEvent) {
        result.set(user.id, { available: true });
      } else {
        // Find next free slot using only this user's events
        const userRanges = allRanges.filter((r) => r.userId === user.id);
        const maxDays = settings.advance_days || 30;
        const nextSlotStart = findNextFreeSlot(settings, userRanges, now, maxDays, timezone);
        result.set(user.id, { available: false, nextSlotStart });
      }
    }
  } catch (err) {
    console.error("[user-availability] Erro ao verificar disponibilidade, fallback para todos disponíveis:", err);
    // Fallback: all agenda users treated as available
    for (const u of agendaUsers) {
      result.set(u.id, { available: true });
    }
  }

  return result;
};

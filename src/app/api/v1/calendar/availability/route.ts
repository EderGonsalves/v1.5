import { NextRequest, NextResponse } from "next/server";
import { fetchCalendarSettings } from "@/services/calendar-settings";
import { listCalendarEvents } from "@/services/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AvailableSlot = {
  date: string;          // YYYY-MM-DD
  date_formatted: string; // "quarta-feira, 11 de fevereiro de 2026"
  day_of_week: string;   // "mon" | "tue" | ... | "sun"
  day_label: string;     // "quarta-feira"
  start: string;         // HH:mm
  end: string;           // HH:mm
  start_datetime: string; // ISO 8601 full
  end_datetime: string;   // ISO 8601 full
};

type AvailabilityResponse = {
  institution_id: number;
  scheduling_enabled: boolean;
  slot_duration_minutes: number;
  buffer_minutes: number;
  timezone: string;
  meet_link: string;
  available_slots: AvailableSlot[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const DAY_LABELS: Record<string, string> = {
  sun: "domingo",
  mon: "segunda-feira",
  tue: "terça-feira",
  wed: "quarta-feira",
  thu: "quinta-feira",
  fri: "sexta-feira",
  sat: "sábado",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Converts a UTC Date to local date string (YYYY-MM-DD) and minute-of-day
 * using the given IANA timezone.
 */
function toLocalComponents(
  date: Date,
  timezone: string,
): { dateStr: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  // Intl may return hour "24" for midnight; normalise to 0
  const minutes = (hour === 24 ? 0 : hour) * 60 + Number(get("minute"));

  return { dateStr, minutes };
}

/**
 * Returns today's date string (YYYY-MM-DD) in the given timezone.
 */
function getLocalToday(timezone: string): string {
  return toLocalComponents(new Date(), timezone).dateStr;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Generates available time slots for a given date considering
 * the institution's settings and existing events.
 */
function generateSlotsForDay(
  date: string,
  dayStart: string,
  dayEnd: string,
  slotDuration: number,
  bufferMinutes: number,
  bookedRanges: { start: number; end: number }[],
): AvailableSlot[] {
  if (!dayStart || !dayEnd) return [];

  const dateObj = new Date(`${date}T12:00:00Z`);
  const dayKey = DAY_KEYS[dateObj.getUTCDay()];
  const dayLabel = DAY_LABELS[dayKey] ?? dayKey;
  const dateFormatted = dateFormatter.format(dateObj);
  const startMin = timeToMinutes(dayStart);
  const endMin = timeToMinutes(dayEnd);
  const slots: AvailableSlot[] = [];

  let cursor = startMin;
  while (cursor + slotDuration <= endMin) {
    const slotEnd = cursor + slotDuration;

    // Check overlap with booked events
    const isBooked = bookedRanges.some(
      (r) => cursor < r.end && slotEnd > r.start,
    );

    if (!isBooked) {
      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(slotEnd);

      slots.push({
        date,
        date_formatted: dateFormatted,
        day_of_week: dayKey,
        day_label: dayLabel,
        start: startTime,
        end: endTime,
        start_datetime: `${date}T${startTime}:00`,
        end_datetime: `${date}T${endTime}:00`,
      });
    }

    cursor = slotEnd + bufferMinutes;
  }

  return slots;
}

// ---------------------------------------------------------------------------
// GET /api/v1/calendar/availability?institutionId=123&days=7&timezone=America/Sao_Paulo
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const institutionIdParam = searchParams.get("institutionId");
  const daysParam = searchParams.get("days");
  const timezoneParam = searchParams.get("timezone") ?? "America/Sao_Paulo";

  if (!institutionIdParam) {
    return NextResponse.json(
      { error: "institutionId é obrigatório" },
      { status: 400 },
    );
  }

  const institutionId = Number(institutionIdParam);
  if (!Number.isFinite(institutionId) || institutionId <= 0) {
    return NextResponse.json(
      { error: "institutionId inválido" },
      { status: 400 },
    );
  }

  try {
    // Fetch settings (use sensible defaults when not yet configured)
    const settings = await fetchCalendarSettings(institutionId);

    const DEFAULT_SETTINGS = {
      scheduling_enabled: false,
      slot_duration_minutes: 30,
      buffer_minutes: 0,
      advance_days: 30,
      mon_start: "09:00", mon_end: "18:00",
      tue_start: "09:00", tue_end: "18:00",
      wed_start: "09:00", wed_end: "18:00",
      thu_start: "09:00", thu_end: "18:00",
      fri_start: "09:00", fri_end: "18:00",
      sat_start: "", sat_end: "",
      sun_start: "", sun_end: "",
      meet_link: "",
    };

    const cfg = settings ?? DEFAULT_SETTINGS;

    const slotDuration = Number(cfg.slot_duration_minutes) || 30;
    const bufferMinutes = Number(cfg.buffer_minutes) || 0;
    const advanceDays = Math.min(
      Number(daysParam) || Number(cfg.advance_days) || 30,
      Number(cfg.advance_days) || 90,
    );

    // Build date range: tomorrow → advance_days (in local timezone)
    const todayStr = getLocalToday(timezoneParam);
    // Use noon UTC to avoid DST edge cases in date arithmetic
    const todayDate = new Date(`${todayStr}T12:00:00Z`);

    // Fetch existing events for the period (±1 day buffer for timezone edges)
    const fetchStart = new Date(todayDate);
    const fetchEnd = new Date(todayDate);
    fetchEnd.setUTCDate(fetchEnd.getUTCDate() + advanceDays + 1);

    const events = await listCalendarEvents({
      institutionId,
      start: fetchStart.toISOString(),
      end: fetchEnd.toISOString(),
      pageSize: 200,
    });

    // Build a map of booked time ranges per LOCAL date
    // Event datetimes are stored in UTC — convert to the target timezone
    // so they align with the local-time working-hours from settings.
    const bookedByDate = new Map<string, { start: number; end: number }[]>();
    for (const ev of events) {
      if (!ev.start_datetime || !ev.end_datetime || ev.deleted_at) continue;

      const evStart = new Date(ev.start_datetime as string);
      const evEnd = new Date(ev.end_datetime as string);

      const localStart = toLocalComponents(evStart, timezoneParam);
      const localEnd = toLocalComponents(evEnd, timezoneParam);

      const ranges = bookedByDate.get(localStart.dateStr) ?? [];
      ranges.push({
        start: localStart.minutes,
        end: localEnd.minutes,
      });
      bookedByDate.set(localStart.dateStr, ranges);
    }

    // Day settings lookup
    const daySettings: Record<string, { start: string; end: string }> = {
      sun: { start: cfg.sun_start, end: cfg.sun_end },
      mon: { start: cfg.mon_start, end: cfg.mon_end },
      tue: { start: cfg.tue_start, end: cfg.tue_end },
      wed: { start: cfg.wed_start, end: cfg.wed_end },
      thu: { start: cfg.thu_start, end: cfg.thu_end },
      fri: { start: cfg.fri_start, end: cfg.fri_end },
      sat: { start: cfg.sat_start, end: cfg.sat_end },
    };

    // Generate slots for each day in the range (local dates)
    const allSlots: AvailableSlot[] = [];

    for (let d = 1; d <= advanceDays; d++) {
      const dayDate = new Date(todayDate);
      dayDate.setUTCDate(dayDate.getUTCDate() + d);
      const dateStr = dayDate.toISOString().slice(0, 10);
      const dayOfWeek = DAY_KEYS[dayDate.getUTCDay()];
      const dayCfg = daySettings[dayOfWeek];

      if (dayCfg?.start && dayCfg?.end) {
        const booked = bookedByDate.get(dateStr) ?? [];
        const daySlots = generateSlotsForDay(
          dateStr,
          dayCfg.start,
          dayCfg.end,
          slotDuration,
          bufferMinutes,
          booked,
        );
        allSlots.push(...daySlots);
      }
    }

    const response: AvailabilityResponse = {
      institution_id: institutionId,
      scheduling_enabled: Boolean(cfg.scheduling_enabled),
      slot_duration_minutes: slotDuration,
      buffer_minutes: bufferMinutes,
      timezone: timezoneParam,
      meet_link: cfg.meet_link || "",
      available_slots: allSlots,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Erro ao gerar disponibilidade:", err);
    return NextResponse.json(
      { error: "Erro ao consultar disponibilidade" },
      { status: 500 },
    );
  }
}

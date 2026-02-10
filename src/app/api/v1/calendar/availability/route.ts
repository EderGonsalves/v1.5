import { NextRequest, NextResponse } from "next/server";
import { fetchCalendarSettings } from "@/services/calendar-settings";
import { listCalendarEvents } from "@/services/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AvailableSlot = {
  date: string;       // YYYY-MM-DD
  day_of_week: string; // "mon" | "tue" | ... | "sun"
  start: string;      // HH:mm
  end: string;        // HH:mm
};

type AvailabilityResponse = {
  institution_id: number;
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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

  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
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
      slots.push({
        date,
        day_of_week: dayKey,
        start: minutesToTime(cursor),
        end: minutesToTime(slotEnd),
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
    // Fetch settings
    const settings = await fetchCalendarSettings(institutionId);
    if (!settings) {
      return NextResponse.json({
        institution_id: institutionId,
        slot_duration_minutes: 0,
        buffer_minutes: 0,
        timezone: timezoneParam,
        available_slots: [],
        message: "Agenda não configurada para esta instituição",
      });
    }

    const slotDuration = settings.slot_duration_minutes || 30;
    const bufferMinutes = settings.buffer_minutes || 0;
    const advanceDays = Math.min(
      Number(daysParam) || settings.advance_days || 30,
      settings.advance_days || 90,
    );

    // Build date range: tomorrow to advance_days
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() + 1); // Start from tomorrow

    const endDate = new Date(today);
    endDate.setUTCDate(endDate.getUTCDate() + advanceDays);

    // Fetch existing events for the period
    const events = await listCalendarEvents({
      institutionId,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      pageSize: 200,
    });

    // Build a map of booked time ranges per date
    const bookedByDate = new Map<string, { start: number; end: number }[]>();
    for (const ev of events) {
      if (!ev.start_datetime || !ev.end_datetime || ev.deleted_at) continue;

      const evStart = new Date(ev.start_datetime as string);
      const evEnd = new Date(ev.end_datetime as string);
      const dateKey = evStart.toISOString().slice(0, 10);

      const ranges = bookedByDate.get(dateKey) ?? [];
      ranges.push({
        start: evStart.getUTCHours() * 60 + evStart.getUTCMinutes(),
        end: evEnd.getUTCHours() * 60 + evEnd.getUTCMinutes(),
      });
      bookedByDate.set(dateKey, ranges);
    }

    // Day settings lookup
    const daySettings: Record<string, { start: string; end: string }> = {
      sun: { start: settings.sun_start, end: settings.sun_end },
      mon: { start: settings.mon_start, end: settings.mon_end },
      tue: { start: settings.tue_start, end: settings.tue_end },
      wed: { start: settings.wed_start, end: settings.wed_end },
      thu: { start: settings.thu_start, end: settings.thu_end },
      fri: { start: settings.fri_start, end: settings.fri_end },
      sat: { start: settings.sat_start, end: settings.sat_end },
    };

    // Generate slots for each day in the range
    const allSlots: AvailableSlot[] = [];
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const dayOfWeek = DAY_KEYS[cursor.getUTCDay()];
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

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const response: AvailabilityResponse = {
      institution_id: institutionId,
      slot_duration_minutes: slotDuration,
      buffer_minutes: bufferMinutes,
      timezone: timezoneParam,
      meet_link: settings.meet_link || "",
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

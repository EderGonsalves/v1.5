import { bench, describe } from "vitest";
import {
  findNextFreeSlot,
  isWithinWorkingHours,
  hasActiveEvent,
} from "../user-availability";
import type { CalendarSettingsRow } from "../calendar-settings";
import type { EventRange } from "../user-availability";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSettings = {
  id: 1,
  institution_id: 1,
  scheduling_enabled: true,
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
  created_at: "",
  updated_at: "",
  user_id: null,
} as CalendarSettingsRow;

/** Generate N non-overlapping event ranges starting from now */
const generateRanges = (count: number, userId = 1): EventRange[] =>
  Array.from({ length: count }, (_, i) => ({
    userId,
    startMs: Date.now() + i * 3_600_000,
    endMs: Date.now() + i * 3_600_000 + 1_800_000,
  }));

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("isWithinWorkingHours", () => {
  bench("dentro do expediente", () => {
    isWithinWorkingHours(mockSettings, "mon", 600); // 10:00
  });

  bench("fora do expediente", () => {
    isWithinWorkingHours(mockSettings, "mon", 1200); // 20:00
  });

  bench("dia sem expediente (sábado)", () => {
    isWithinWorkingHours(mockSettings, "sat", 600);
  });
});

describe("hasActiveEvent", () => {
  bench("10 eventos", () => {
    hasActiveEvent(generateRanges(10), 1, Date.now());
  });

  bench("50 eventos", () => {
    hasActiveEvent(generateRanges(50), 1, Date.now());
  });

  bench("200 eventos", () => {
    hasActiveEvent(generateRanges(200), 1, Date.now());
  });

  bench("500 eventos", () => {
    hasActiveEvent(generateRanges(500), 1, Date.now());
  });
});

describe("findNextFreeSlot", () => {
  bench("agenda vazia — 30 dias", () => {
    findNextFreeSlot(mockSettings, [], new Date(), 30, "America/Sao_Paulo");
  });

  bench("50 eventos — 30 dias", () => {
    findNextFreeSlot(
      mockSettings,
      generateRanges(50),
      new Date(),
      30,
      "America/Sao_Paulo",
    );
  });

  bench("200 eventos — 30 dias", () => {
    findNextFreeSlot(
      mockSettings,
      generateRanges(200),
      new Date(),
      30,
      "America/Sao_Paulo",
    );
  });

  bench("worst case: 540 eventos (agenda lotada 30 dias)", () => {
    findNextFreeSlot(
      mockSettings,
      generateRanges(540),
      new Date(),
      30,
      "America/Sao_Paulo",
    );
  });
});

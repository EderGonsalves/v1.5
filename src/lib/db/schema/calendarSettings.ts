import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * calendarSettings — Baserow table 246
 * PostgreSQL table: database_table_246
 */
export const calendarSettings = pgTable("database_table_246", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1869"), // institution_id (number)
  slotDurationMinutes: numeric("field_1870"), // slot_duration_minutes (number)
  advanceDays: numeric("field_1871"), // advance_days (number)
  bufferMinutes: numeric("field_1872"), // buffer_minutes (number)
  monStart: text("field_1873"), // mon_start (text)
  monEnd: text("field_1874"), // mon_end (text)
  tueStart: text("field_1875"), // tue_start (text)
  tueEnd: text("field_1876"), // tue_end (text)
  wedStart: text("field_1877"), // wed_start (text)
  wedEnd: text("field_1878"), // wed_end (text)
  thuStart: text("field_1879"), // thu_start (text)
  thuEnd: text("field_1880"), // thu_end (text)
  friStart: text("field_1881"), // fri_start (text)
  friEnd: text("field_1882"), // fri_end (text)
  satStart: text("field_1883"), // sat_start (text)
  satEnd: text("field_1884"), // sat_end (text)
  sunStart: text("field_1885"), // sun_start (text)
  sunEnd: text("field_1886"), // sun_end (text)
  createdAt: text("field_1887"), // created_at (text)
  updatedAt: text("field_1888"), // updated_at (text)
  meetLink: text("field_1889"), // meet_link (text)
  schedulingEnabled: boolean("field_1890"), // scheduling_enabled (boolean)
});

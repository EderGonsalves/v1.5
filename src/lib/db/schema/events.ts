import { jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * events — Baserow table 234
 * PostgreSQL table: database_table_234
 */
export const events = pgTable("database_table_234", {
  id: serial("id").primaryKey(),
  institutionID: numeric("field_1773"), // InstitutionID (number)
  title: text("field_1774"), // title (text)
  startDatetime: timestamp("field_1775", { withTimezone: true }), // start_datetime (date)
  endDatetime: timestamp("field_1776", { withTimezone: true }), // end_datetime (date)
  timezone: text("field_1777"), // timezone (text)
  location: text("field_1778"), // location (text)
  meetingLink: text("field_1779"), // meeting_link (text)
  googleEventId: text("field_1780"), // google_event_id (text)
  syncStatus: text("field_1781"), // sync_status (text)
  createdAt: timestamp("field_1782", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1783", { withTimezone: true }), // updated_at (date)
  description: text("field_1784"), // description (long_text)
  userId: numeric("field_1785"), // user_id (number)
  reminderMinutesBefore: numeric("field_1786"), // reminder_minutes_before (number)
  notifyByEmail: text("field_1787"), // notify_by_email (text)
  notifyByPhone: text("field_1788"), // notify_by_phone (text)
  eventGuests: jsonb("field_1792"), // event_guests (link_row → table 235)
});

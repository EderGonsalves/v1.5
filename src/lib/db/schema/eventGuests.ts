import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * eventGuests — Baserow table 235
 * PostgreSQL table: database_table_235
 */
export const eventGuests = pgTable("database_table_235", {
  id: serial("id").primaryKey(),
  name: text("field_1789"), // name (text)
  eventId: jsonb("field_1790"), // event_id (link_row → table 234)
  email: text("field_1791"), // email (text)
  phone: text("field_1793"), // phone (text)
  notificationStatus: text("field_1794"), // notification_status (text)
  createdAt: timestamp("field_1795", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1796", { withTimezone: true }), // updated_at (date)
});

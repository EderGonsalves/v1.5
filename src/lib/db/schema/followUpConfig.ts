import { numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * followUpConfig — Baserow table 229
 * PostgreSQL table: database_table_229
 */
export const followUpConfig = pgTable("database_table_229", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1715"), // institution_id (number)
  messageOrder: numeric("field_1716"), // message_order (number)
  delayMinutes: numeric("field_1717"), // delay_minutes (number)
  messageContent: text("field_1718"), // message_content (long_text)
  isActive: text("field_1719"), // is_active (text)
  allowedDays: text("field_1720"), // allowed_days (text)
  allowedStartTime: text("field_1721"), // allowed_start_time (text)
  allowedEndTime: text("field_1722"), // allowed_end_time (text)
  createdAt: timestamp("field_1723", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1724", { withTimezone: true }), // updated_at (date)
});

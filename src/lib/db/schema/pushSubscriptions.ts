import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * pushSubscriptions — Baserow table 254
 * PostgreSQL table: database_table_254
 */
export const pushSubscriptions = pgTable("database_table_254", {
  id: serial("id").primaryKey(),
  endpoint: text("field_1954"), // endpoint (text)
  p256dh: text("field_1955"), // p256dh (text)
  auth: text("field_1956"), // auth (text)
  userEmail: text("field_1957"), // user_email (text)
  userName: text("field_1958"), // user_name (text)
  legacyUserId: text("field_1959"), // legacy_user_id (text)
  institutionId: numeric("field_1960"), // institution_id (number)
  userAgent: text("field_1961"), // user_agent (text)
  createdAt: text("field_1962"), // created_at (text)
  updatedAt: text("field_1963"), // updated_at (text)
});

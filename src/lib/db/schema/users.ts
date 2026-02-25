import { boolean, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * users — Baserow table 236
 * PostgreSQL table: database_table_236
 */
export const users = pgTable("database_table_236", {
  id: serial("id").primaryKey(),
  legacyUserId: text("field_1797"), // legacy_user_id (text)
  institutionId: numeric("field_1798"), // institution_id (number)
  name: text("field_1799"), // name (text)
  email: text("field_1800"), // email (text)
  isActive: boolean("field_1801"), // is_active (boolean)
  createdAt: timestamp("field_1802", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1803", { withTimezone: true }), // updated_at (date)
  // userRole: SKIP (link_row → table 241) — "user_role"
  phone: text("field_1840"), // phone (text)
  oab: text("field_1841"), // oab (text)
  password: text("field_1842"), // password (text)
  isOfficeAdmin: boolean("field_1909"), // is_office_admin (boolean)
  receivesCases: boolean("field_1923"), // receives_cases (boolean)
});

import { boolean, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * roles — Baserow table 237
 * PostgreSQL table: database_table_237
 */
export const roles = pgTable("database_table_237", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1804"), // institution_id (number)
  usersInstitutionId: numeric("field_1805"), // users.institution_id (number)
  name: text("field_1806"), // name (text)
  description: text("field_1807"), // description (long_text)
  isSystem: boolean("field_1808"), // is_system (boolean)
  createdAt: timestamp("field_1809", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1810", { withTimezone: true }), // updated_at (date)
  // rolePermission: SKIP (link_row → table 240) — "role_permission"
  // userRole: SKIP (link_row → table 241) — "user_role"
});

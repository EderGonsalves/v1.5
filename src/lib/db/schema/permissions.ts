import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * permissions — Baserow table 239
 * PostgreSQL table: database_table_239
 */
export const permissions = pgTable("database_table_239", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1818"), // institution_id (number)
  code: text("field_1819"), // code (text)
  active: boolean("field_1820"), // Active (boolean)
  description: text("field_1821"), // description (long_text)
  // menuId: SKIP (link_row → table 238) — "menu_id"
  // rolePermission: SKIP (link_row → table 240) — "role_permission"
});

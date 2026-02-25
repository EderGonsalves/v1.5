import { boolean, jsonb, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * menu — Baserow table 238
 * PostgreSQL table: database_table_238
 */
export const menu = pgTable("database_table_238", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1811"), // institution_id (number)
  label: text("field_1812"), // label (text)
  path: text("field_1813"), // path (text)
  permissionCode: text("field_1814"), // permission_code (text)
  parentId: jsonb("field_1815"),    // parent_id (link_row → table 238)
  displayOrder: numeric("field_1816"), // display_order (number)
  isActive: boolean("field_1817"), // is_active (boolean)
  permission: jsonb("field_1836"),  // permission (link_row → table 239)
});

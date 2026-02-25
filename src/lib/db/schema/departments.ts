import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * departments — Baserow table 247
 * PostgreSQL table: database_table_247
 */
export const departments = pgTable("database_table_247", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1891"), // institution_id (number)
  name: text("field_1892"), // name (text)
  description: text("field_1893"), // description (long_text)
  isActive: boolean("field_1894"), // is_active (boolean)
  createdAt: text("field_1895"), // created_at (text)
  updatedAt: text("field_1896"), // updated_at (text)
});

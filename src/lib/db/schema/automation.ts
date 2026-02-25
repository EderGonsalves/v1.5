import { jsonb, pgTable, serial } from "drizzle-orm/pg-core";

/**
 * automation — Baserow table 219
 * PostgreSQL table: database_table_219
 */
export const automation = pgTable("database_table_219", {
  id: serial("id").primaryKey(),
  arquivo: jsonb("field_1528"), // arquivo (file)
});

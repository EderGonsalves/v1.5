import { jsonb, numeric, pgTable, serial } from "drizzle-orm/pg-core";

/**
 * userRoles — Baserow table 241
 * PostgreSQL table: database_table_241
 */
export const userRoles = pgTable("database_table_241", {
  id: serial("id").primaryKey(),
  nome: numeric("field_1826"), // nome (number)
  roleId: jsonb("field_1827"),  // role_id (link_row → table 237)
  userId: jsonb("field_1837"),  // user_id (link_row → table 236)
});

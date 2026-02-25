import { jsonb, numeric, pgTable, serial } from "drizzle-orm/pg-core";

/**
 * rolePermissions — Baserow table 240
 * PostgreSQL table: database_table_240
 */
export const rolePermissions = pgTable("database_table_240", {
  id: serial("id").primaryKey(),
  pkComposta: numeric("field_1823"), // pk_composta (number)
  permissionId: jsonb("field_1824"), // permission_id (link_row → table 239)
  roleId: jsonb("field_1825"),       // role_id (link_row → table 237)
});

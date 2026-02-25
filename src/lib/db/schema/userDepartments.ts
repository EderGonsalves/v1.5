import { boolean, numeric, pgTable, serial } from "drizzle-orm/pg-core";

/**
 * userDepartments — Baserow table 248
 * PostgreSQL table: database_table_248
 */
export const userDepartments = pgTable("database_table_248", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1897"), // institution_id (number)
  userId: numeric("field_1898"), // user_id (number)
  departmentId: numeric("field_1899"), // department_id (number)
  isPrimary: boolean("field_1900"), // is_primary (boolean)
});

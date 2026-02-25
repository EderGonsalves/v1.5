import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * assignmentQueue — Baserow table 251
 * PostgreSQL table: database_table_251
 */
export const assignmentQueue = pgTable("database_table_251", {
  id: serial("id").primaryKey(),
  userId: numeric("field_1919"), // user_id (number)
  institutionId: numeric("field_1920"), // institution_id (number)
  lastAssignedAt: text("field_1921"), // last_assigned_at (text)
  assignmentCount: numeric("field_1922"), // assignment_count (number)
});

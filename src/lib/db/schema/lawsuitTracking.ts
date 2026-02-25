import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * lawsuitTracking — Baserow table 252
 * PostgreSQL table: database_table_252
 */
export const lawsuitTracking = pgTable("database_table_252", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_1932"), // case_id (number)
  institutionId: numeric("field_1933"), // institution_id (number)
  cnj: text("field_1934"), // cnj (text)
  isActive: text("field_1935"), // is_active (text)
  codiloProcessId: text("field_1936"), // codilo_process_id (text)
  status: text("field_1937"), // status (text)
  errorMessage: text("field_1938"), // error_message (text)
  movementsCount: numeric("field_1939"), // movements_count (number)
  lastUpdateAt: text("field_1940"), // last_update_at (text)
  createdAt: text("field_1941"), // created_at (text)
  updatedAt: text("field_1942"), // updated_at (text)
});

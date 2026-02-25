import { numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * caseKanbanStatus — Baserow table 232
 * PostgreSQL table: database_table_232
 */
export const caseKanbanStatus = pgTable("database_table_232", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_1746"), // case_id (number)
  institutionId: numeric("field_1747"), // institution_id (number)
  columnId: numeric("field_1748"), // column_id (number)
  movedAt: timestamp("field_1749", { withTimezone: true }), // moved_at (date)
  movedBy: text("field_1750"), // moved_by (text)
  notes: text("field_1751"), // notes (long_text)
});

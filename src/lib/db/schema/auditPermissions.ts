import { numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * auditPermissions — Baserow table 242
 * PostgreSQL table: database_table_242
 */
export const auditPermissions = pgTable("database_table_242", {
  id: serial("id").primaryKey(),
  actedByUserId: numeric("field_1829"), // acted_by_user_id (number)
  targetType: text("field_1830"), // target_type (text)
  targetId: numeric("field_1831"), // target_id (number)
  changeSummary: text("field_1832"), // change_summary (long_text)
  createdAt: timestamp("field_1833", { withTimezone: true }), // created_at (date)
});

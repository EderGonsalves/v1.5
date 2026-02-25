import { numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * kanbanColumns — Baserow table 231
 * PostgreSQL table: database_table_231
 */
export const kanbanColumns = pgTable("database_table_231", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_1738"), // institution_id (number)
  name: text("field_1739"), // name (text)
  ordem: numeric("field_1740"), // ordem (number)
  color: text("field_1741"), // color (text)
  isDefault: text("field_1742"), // is_default (text)
  autoRule: text("field_1743"), // auto_rule (long_text)
  createdAt: timestamp("field_1744", { withTimezone: true }), // created_at (date)
  updatedAt: timestamp("field_1745", { withTimezone: true }), // updated_at (date)
  departmentId: numeric("field_1910"), // department_id (number)
});

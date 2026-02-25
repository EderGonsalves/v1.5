import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * supportTickets — Baserow table 243
 * PostgreSQL table: database_table_243
 */
export const supportTickets = pgTable("database_table_243", {
  id: serial("id").primaryKey(),
  protocol: text("field_1843"), // protocol (text)
  institutionId: numeric("field_1844"), // institution_id (number)
  createdByName: text("field_1845"), // created_by_name (text)
  createdByEmail: text("field_1846"), // created_by_email (text)
  category: text("field_1847"), // category (text)
  subject: text("field_1848"), // subject (text)
  description: text("field_1849"), // description (long_text)
  status: text("field_1850"), // status (text)
  sector: text("field_1851"), // sector (text)
  assignedTo: text("field_1852"), // assigned_to (text)
  createdAt: text("field_1853"), // created_at (text)
  updatedAt: text("field_1854"), // updated_at (text)
  createdByPhone: text("field_1855"), // created_by_phone (text)
  departmentId: numeric("field_1904"), // department_id (number)
  departmentName: text("field_1905"), // department_name (text)
  assignedToUserId: numeric("field_1906"), // assigned_to_user_id (number)
});

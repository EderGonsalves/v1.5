import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * supportMessages — Baserow table 244
 * PostgreSQL table: database_table_244
 */
export const supportMessages = pgTable("database_table_244", {
  id: serial("id").primaryKey(),
  ticketId: numeric("field_1856"), // ticket_id (number)
  institutionId: numeric("field_1857"), // institution_id (number)
  authorName: text("field_1858"), // author_name (text)
  authorRole: text("field_1859"), // author_role (text)
  content: text("field_1860"), // content (long_text)
  createdAt: text("field_1861"), // created_at (text)
  authorEmail: text("field_1867"), // author_email (text)
  authorPhone: text("field_1868"), // author_phone (text)
});

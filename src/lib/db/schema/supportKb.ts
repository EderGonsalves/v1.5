import { pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * supportKb — Baserow table 245
 * PostgreSQL table: database_table_245
 */
export const supportKb = pgTable("database_table_245", {
  id: serial("id").primaryKey(),
  title: text("field_1862"), // title (text)
  content: text("field_1863"), // content (long_text)
  category: text("field_1864"), // category (text)
  tags: text("field_1865"), // tags (text)
  createdAt: text("field_1866"), // created_at (text)
});

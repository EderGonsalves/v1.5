import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * institution_tags — Baserow table 258
 * PostgreSQL table: database_table_258
 *
 * Field IDs discovered via Baserow API on 2026-03-20.
 */
export const institutionTags = pgTable("database_table_258", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_2010"),   // institution_id (number)
  category: text("field_2011"),           // category (text)
  name: text("field_2012"),               // name (text)
  description: text("field_2013"),        // description (long_text)
  color: text("field_2014"),              // color (text)
  isActive: boolean("field_2015"),        // is_active (boolean)
  sortOrder: numeric("field_2016"),       // sort_order (number)
  parentTagId: numeric("field_2017"),     // parent_tag_id (number)
  aiCriteria: text("field_2018"),         // ai_criteria (long_text)
  createdAt: text("field_2019"),          // created_at (text)
  updatedAt: text("field_2020"),          // updated_at (text)
});

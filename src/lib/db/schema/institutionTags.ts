import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * institution_tags — Baserow table 258
 * PostgreSQL table: database_table_258
 *
 * IMPORTANT: field IDs are placeholders — run discover-schema.ts after
 * creating the table in Baserow to get the actual field IDs.
 */
export const institutionTags = pgTable("database_table_258", {
  id: serial("id").primaryKey(),
  institutionId: numeric("field_2001"),   // institution_id (number)
  category: text("field_2002"),           // category (text)
  name: text("field_2003"),               // name (text)
  description: text("field_2004"),        // description (long_text)
  color: text("field_2005"),              // color (text)
  isActive: boolean("field_2006"),        // is_active (boolean)
  sortOrder: numeric("field_2007"),       // sort_order (number)
  parentTagId: numeric("field_2008"),     // parent_tag_id (number)
  aiCriteria: text("field_2009"),         // ai_criteria (long_text)
  createdAt: text("field_2010"),          // created_at (text)
  updatedAt: text("field_2011"),          // updated_at (text)
});

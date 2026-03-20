import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * case_tags — Baserow table 259
 * PostgreSQL table: database_table_259
 *
 * IMPORTANT: field IDs are placeholders — run discover-schema.ts after
 * creating the table in Baserow to get the actual field IDs.
 */
export const caseTags = pgTable("database_table_259", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_2012"),          // case_id (number)
  tagId: numeric("field_2013"),           // tag_id (number)
  institutionId: numeric("field_2014"),   // institution_id (number)
  assignedBy: text("field_2015"),         // assigned_by (text) — "ai" or user_id
  assignedAt: text("field_2016"),         // assigned_at (text)
  confidence: numeric("field_2017"),      // confidence (number) — 0-1, for AI
});

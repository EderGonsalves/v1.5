import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * case_tags — Baserow table 259
 * PostgreSQL table: database_table_259
 *
 * Field IDs discovered via Baserow API on 2026-03-20.
 */
export const caseTags = pgTable("database_table_259", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_2021"),          // case_id (number)
  tagId: numeric("field_2022"),           // tag_id (number)
  institutionId: numeric("field_2023"),   // institution_id (number)
  assignedBy: text("field_2024"),         // assigned_by (text) — "ai" or user_id
  assignedAt: text("field_2025"),         // assigned_at (text)
  confidence: numeric("field_2026"),      // confidence (number) — 0-1, for AI
});

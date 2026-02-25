import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * caseMessages — Baserow table 227
 * PostgreSQL table: database_table_227
 */
export const caseMessages = pgTable("database_table_227", {
  id: serial("id").primaryKey(),
  caseId: text("field_1701"), // CaseId (text)
  sender: jsonb("field_1702"), // Sender (multiple_select) — JSONB array of {id,value}
  dataHora: text("field_1703"), // DataHora (text)
  message: text("field_1704"), // Message (long_text)
  file: jsonb("field_1705"), // file (file) — JSONB array
  from: text("field_1706"), // from (text)
  to: text("field_1707"), // to (text)
  senderName: text("field_2006"), // SenderName (text)
  // Baserow internal auto-columns (not in field map)
  createdOn: timestamp("created_on", { withTimezone: true }),
  updatedOn: timestamp("updated_on", { withTimezone: true }),
  order: text("order"), // Baserow row ordering
});

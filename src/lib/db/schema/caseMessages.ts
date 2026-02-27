import { jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * caseMessages — Baserow table 227
 * PostgreSQL table: database_table_227
 *
 * NOTA: O campo Sender (field_1702) é multiple_select no Baserow.
 * Campos multiple_select NÃO existem como coluna na tabela PG —
 * são armazenados em tabela de junção interna do Baserow.
 * A detecção de remetente usa os campos from/to (prioridade 1).
 */
export const caseMessages = pgTable("database_table_227", {
  id: serial("id").primaryKey(),
  caseId: text("field_1701"), // CaseId (text)
  // sender: campo multiple_select — NÃO existe como coluna PG (ver nota acima)
  dataHora: text("field_1703"), // DataHora (text)
  message: text("field_1704"), // Message (long_text)
  file: jsonb("field_1705"), // file (file) — JSONB array
  from: text("field_1706"), // from (text)
  to: text("field_1707"), // to (text)
  senderName: text("field_2006"), // SenderName (text)
  // Baserow internal auto-columns (NOT NULL, no SQL DEFAULT — Django manages them)
  createdOn: timestamp("created_on", { withTimezone: true }).notNull(),
  updatedOn: timestamp("updated_on", { withTimezone: true }).notNull(),
  order: numeric("order", { precision: 40, scale: 20 }).notNull(),
});

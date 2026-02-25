import { numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * followUpHistory — Baserow table 230
 * PostgreSQL table: database_table_230
 */
export const followUpHistory = pgTable("database_table_230", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_1725"), // case_id (number)
  institutionId: numeric("field_1726"), // institution_id (number)
  configId: numeric("field_1727"), // config_id (number)
  messageOrder: numeric("field_1728"), // message_order (number)
  customerPhone: text("field_1729"), // customer_phone (text)
  messageSent: text("field_1730"), // message_sent (long_text)
  sentAt: timestamp("field_1731", { withTimezone: true }), // sent_at (date)
  status: text("field_1732"), // status (text)
  errorMessage: text("field_1733"), // error_message (text)
  lastClientMessageAt: timestamp("field_1734", { withTimezone: true }), // last_client_message_at (date)
});

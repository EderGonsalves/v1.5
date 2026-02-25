import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * webhooks — Baserow table 228
 * PostgreSQL table: database_table_228
 */
export const webhooks = pgTable("database_table_228", {
  id: serial("id").primaryKey(),
  webhookUrl: text("field_1709"), // webhook_url (text)
  webhookSecret: text("field_1710"), // webhook_secret (text)
  webhookActive: text("field_1711"), // webhook_active (text)
  webhookAlerts: text("field_1712"), // webhook_alerts (text)
  webhoockInstitutionId: numeric("field_1714"), // webhoock_institution_id (number)
});

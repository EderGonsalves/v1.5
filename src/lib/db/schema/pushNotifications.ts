import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * pushNotifications — Baserow table 255
 * PostgreSQL table: database_table_255
 */
export const pushNotifications = pgTable("database_table_255", {
  id: serial("id").primaryKey(),
  title: text("field_1964"), // title (text)
  body: text("field_1965"), // body (long_text)
  url: text("field_1966"), // url (text)
  icon: text("field_1967"), // icon (text)
  institutionId: numeric("field_1968"), // institution_id (number)
  sentByEmail: text("field_1969"), // sent_by_email (text)
  sentByName: text("field_1970"), // sent_by_name (text)
  sentAt: text("field_1971"), // sent_at (text)
  recipientsCount: numeric("field_1972"), // recipients_count (number)
  status: text("field_1973"), // status (text)
  errorLog: text("field_1974"), // error_log (long_text)
});

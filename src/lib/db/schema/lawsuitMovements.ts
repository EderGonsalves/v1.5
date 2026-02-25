import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * lawsuitMovements — Baserow table 253
 * PostgreSQL table: database_table_253
 */
export const lawsuitMovements = pgTable("database_table_253", {
  id: serial("id").primaryKey(),
  trackingId: numeric("field_1943"), // tracking_id (number)
  caseId: numeric("field_1944"), // case_id (number)
  institutionId: numeric("field_1945"), // institution_id (number)
  movementDate: text("field_1946"), // movement_date (text)
  movementType: text("field_1947"), // movement_type (text)
  title: text("field_1948"), // title (text)
  content: text("field_1949"), // content (long_text)
  sourceCourt: text("field_1950"), // source_court (text)
  rawPayload: text("field_1951"), // raw_payload (long_text)
  createdAt: text("field_1952"), // created_at (text)
});

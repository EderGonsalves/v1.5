import { boolean, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * userFeatures — Baserow table 250
 * PostgreSQL table: database_table_250
 */
export const userFeatures = pgTable("database_table_250", {
  id: serial("id").primaryKey(),
  userId: numeric("field_1915"), // user_id (number)
  institutionId: numeric("field_1916"), // institution_id (number)
  featureKey: text("field_1917"), // feature_key (text)
  isEnabled: boolean("field_1918"), // is_enabled (boolean)
});

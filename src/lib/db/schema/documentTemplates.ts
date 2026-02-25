import { boolean, integer, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * documentTemplates — Baserow table 257
 * PostgreSQL table: database_table_257
 */
export const documentTemplates = pgTable("database_table_257", {
  id: serial("id").primaryKey(),
  name: text("field_1990"), // name (text)
  description: text("field_1991"), // description (long_text)
  category: integer("field_1992"), // category (single_select)
  institutionId: numeric("field_1993"), // institution_id (number)
  createdByUserId: numeric("field_1994"), // created_by_user_id (number)
  filePath: text("field_1995"), // file_path (text)
  variables: text("field_1996"), // variables (long_text)
  isActive: boolean("field_1997"), // is_active (boolean)
  createdAt: text("field_1998"), // created_at (text)
  updatedAt: text("field_1999"), // updated_at (text)
  templateType: text("field_2002"), // template_type (text)
  originalFilename: text("field_2003"), // original_filename (text)
});

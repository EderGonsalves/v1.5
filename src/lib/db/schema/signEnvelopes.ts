import { integer, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * signEnvelopes — Baserow table 256
 * PostgreSQL table: database_table_256
 */
export const signEnvelopes = pgTable("database_table_256", {
  id: serial("id").primaryKey(),
  caseId: numeric("field_1976"), // case_id (number)
  envelopeId: text("field_1977"), // envelope_id (text)
  documentId: text("field_1978"), // document_id (text)
  subject: text("field_1979"), // subject (text)
  status: integer("field_1980"), // status (single_select)
  signerName: text("field_1981"), // signer_name (text)
  signerPhone: text("field_1982"), // signer_phone (text)
  signerEmail: text("field_1983"), // signer_email (text)
  signUrl: text("field_1984"), // sign_url (url)
  signedAt: text("field_1985"), // signed_at (text)
  institutionId: numeric("field_1986"), // institution_id (number)
  createdByUserId: numeric("field_1987"), // created_by_user_id (number)
  createdAt: text("field_1988"), // created_at (text)
  updatedAt: text("field_1989"), // updated_at (text)
  signersJson: text("field_2004"), // signers_json (long_text)
});

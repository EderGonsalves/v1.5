import { integer, jsonb, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";

/**
 * cases — Baserow table 225
 * PostgreSQL table: database_table_225
 */
export const cases = pgTable("database_table_225", {
  id: serial("id").primaryKey(),
  caseId: integer("field_1683"), // CaseId (autonumber)
  custumerPhone: text("field_1684"), // CustumerPhone (text)
  custumerName: text("field_1685"), // CustumerName (text)
  depoimentoInicial: text("field_1686"), // DepoimentoInicial (text)
  etapaPerguntas: text("field_1687"), // EtapaPerguntas (text)
  etapaFinal: text("field_1688"), // EtapaFinal (text)
  resumo: text("field_1689"), // Resumo (long_text)
  conversa: text("field_1690"), // Conversa (long_text)
  bJCaseId: text("field_1691"), // BJCaseId (text)
  institutionID: text("field_1692"), // InstitutionID (text)
  iApause: text("field_1693"), // IApause (text)
  image: jsonb("field_1694"), // image (file)
  data: text("field_1699"), // Data (text)
  custumeId: text("field_1700"), // CustumeId (text)
  lastAlertStage: text("field_1713"), // last_alert_stage (text)
  messageOrder: text("field_1735"), // message_order (text)
  valor: numeric("field_1752"), // valor (number)
  resultado: text("field_1753"), // resultado (text)
  // cliente: SKIP (link_row → table 233) — "cliente"
  responsavel: text("field_1771"), // responsavel (text)
  statusCaso: text("field_1772"), // status_caso (text)
  departmentId: numeric("field_1901"), // department_id (number)
  departmentName: text("field_1902"), // department_name (text)
  assignedToUserId: numeric("field_1903"), // assigned_to_user_id (number)
  // stats: SKIP (link_row → table 249) — "stats"
  caseSource: text("field_1924"), // case_source (text)
  createdByUserId: numeric("field_1925"), // created_by_user_id (number)
  createdByUserName: text("field_1926"), // created_by_user_name (text)
  cnjNumber: text("field_1928"), // cnj_number (text)
  lawsuitTrackingActive: text("field_1929"), // lawsuit_tracking_active (text)
  lawsuitSummary: text("field_1930"), // lawsuit_summary (long_text)
  lawsuitLastUpdate: text("field_1931"), // lawsuit_last_update (text)
  notasCaso: text("field_1953"), // notas_caso (long_text)
  signEnvelopeId: text("field_2000"), // sign_envelope_id (text)
  signStatus: text("field_2001"), // sign_status (text)
});

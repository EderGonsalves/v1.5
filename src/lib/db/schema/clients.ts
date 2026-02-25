import { jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * clients — Baserow table 233
 * PostgreSQL table: database_table_233
 */
export const clients = pgTable("database_table_233", {
  id: serial("id").primaryKey(),
  nomeCompleto: text("field_1754"), // nome_completo (text)
  cpf: text("field_1755"), // cpf (text)
  rg: text("field_1756"), // rg (text)
  celular: text("field_1757"), // celular (text)
  email: text("field_1758"), // email (text)
  estadoCivil: text("field_1759"), // estado_civil (text)
  profissao: text("field_1760"), // profissao (text)
  dataNascimento: timestamp("field_1761", { withTimezone: true }), // data_nascimento (date)
  nacionalidade: text("field_1762"), // nacionalidade (text)
  enderecoRua: text("field_1763"), // endereco_rua (text)
  enderecoNumero: text("field_1764"), // endereco_numero (text)
  enderecoComplemento: text("field_1765"), // endereco_complemento (text)
  enderecoEstado: text("field_1766"), // endereco_estado (text)
  enderecoCidade: text("field_1767"), // endereco_cidade (text)
  institutionId: numeric("field_1768"), // institution_id (number)
  cases: jsonb("field_1770"), // cases (link_row → table 225)
});

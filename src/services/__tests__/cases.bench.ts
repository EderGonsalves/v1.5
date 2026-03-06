import { bench, describe } from "vitest";
import {
  formatDateBR,
  buildCaseSetObj,
  mapCaseRowLight,
  stripHeavyFields,
  type BaserowCaseRow,
} from "../api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const fullCaseRow: BaserowCaseRow = {
  id: 42,
  CaseId: 100,
  CustumerPhone: "5511999999999",
  CustumerName: "Maria da Silva Santos Oliveira",
  Data: "2026-03-03T12:00:00.000Z",
  DepoimentoInicial: "Relato completo do cliente sobre o caso jurídico em questão...",
  EtapaPerguntas: "sim",
  EtapaFinal: "não",
  Conversa: "Conversa muito longa com muitas mensagens trocadas entre o atendente e o cliente...\n".repeat(100),
  Resumo: "Resumo detalhado do caso com todas as informações relevantes coletadas...\n".repeat(50),
  BJCaseId: "BJ-12345",
  InstitutionID: 5,
  IApause: "false",
  responsavel: "Carlos Pereira",
  department_id: 10,
  department_name: "Jurídico",
  assigned_to_user_id: 7,
  valor: 15000.50,
  resultado: "procedente",
  case_source: "whatsapp",
  status_caso: "ativo",
  cnj_number: "1234567-89.2026.8.26.0100",
  lawsuit_tracking_active: "true",
  lawsuit_summary: "Movimentações recentes do processo...\n".repeat(20),
  notas_caso: "Notas internas do caso...\n".repeat(10),
  sign_envelope_id: "env-abc-123",
  sign_status: "signed",
  created_by_user_id: 3,
  created_by_user_name: "Admin",
};

const drizzleLightRow = {
  id: 42,
  caseId: 100,
  custumerPhone: "5511999999999",
  custumerName: "Maria da Silva Santos Oliveira",
  data: "2026-03-03T12:00:00.000Z",
  etapaPerguntas: "sim",
  etapaFinal: "não",
  depoimentoInicial: "Relato...",
  iApause: "false",
  bJCaseId: "BJ-12345",
  institutionID: "5",
  responsavel: "Carlos Pereira",
  departmentId: "10",
  departmentName: "Jurídico",
  assignedToUserId: "7",
  valor: "15000.50",
  resultado: "procedente",
  caseSource: "whatsapp",
  statusCaso: "ativo",
  cnjNumber: "1234567-89.2026.8.26.0100",
  lawsuitTrackingActive: "true",
  signEnvelopeId: "env-abc-123",
  signStatus: "signed",
  createdByUserId: "3",
  createdByUserName: "Admin",
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("formatDateBR", () => {
  bench("ISO → BR", () => {
    formatDateBR("2026-03-03T15:30:00.000Z");
  });

  bench("já formatado (skip)", () => {
    formatDateBR("03/03/2026 15:30");
  });

  bench("valor vazio", () => {
    formatDateBR("");
  });
});

describe("stripHeavyFields", () => {
  bench("row completa (5 campos pesados)", () => {
    stripHeavyFields(fullCaseRow);
  });
});

describe("mapCaseRowLight", () => {
  bench("mapeamento Drizzle → Baserow (20 campos)", () => {
    mapCaseRowLight(drizzleLightRow);
  });
});

describe("buildCaseSetObj", () => {
  bench("conversão completa (todos os campos)", () => {
    buildCaseSetObj(fullCaseRow);
  });

  bench("conversão parcial (3 campos)", () => {
    buildCaseSetObj({
      responsavel: "Ana",
      assigned_to_user_id: 5,
      department_id: 10,
    });
  });
});

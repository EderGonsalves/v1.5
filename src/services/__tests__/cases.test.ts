import { describe, it, expect } from "vitest";
import {
  formatDateBR,
  buildCaseSetObj,
  mapCaseRowLight,
  stripHeavyFields,
  type BaserowCaseRow,
} from "../api";

// ---------------------------------------------------------------------------
// formatDateBR
// ---------------------------------------------------------------------------

describe("formatDateBR", () => {
  it("converte ISO para formato brasileiro DD/MM/YYYY HH:MM", () => {
    // Note: output depends on server TZ; we just check structure
    const result = formatDateBR("2026-03-03T15:30:00.000Z");
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("mantém data já no formato brasileiro", () => {
    expect(formatDateBR("03/03/2026 15:30")).toBe("03/03/2026 15:30");
  });

  it("mantém formato BR com data longa", () => {
    expect(formatDateBR("20/02/2026")).toBe("20/02/2026");
  });

  it("retorna undefined para valor vazio", () => {
    expect(formatDateBR("")).toBeUndefined();
    expect(formatDateBR(null)).toBeUndefined();
    expect(formatDateBR(undefined)).toBeUndefined();
  });

  it("retorna undefined para valor não-string", () => {
    expect(formatDateBR(123)).toBeUndefined();
    expect(formatDateBR({})).toBeUndefined();
  });

  it("retorna string original para data inválida", () => {
    expect(formatDateBR("texto-qualquer")).toBe("texto-qualquer");
  });

  it("trata string com espaços", () => {
    expect(formatDateBR("  ")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stripHeavyFields
// ---------------------------------------------------------------------------

describe("stripHeavyFields", () => {
  const fullRow: BaserowCaseRow = {
    id: 1,
    CaseId: 100,
    CustumerName: "João",
    CustumerPhone: "5511999999999",
    Conversa: "texto longo...",
    Resumo: "resumo longo...",
    notas_caso: "notas...",
    lawsuit_summary: "sumário...",
    image: [{ url: "http://example.com/img.jpg" }] as BaserowCaseRow["image"],
    responsavel: "Ana",
  };

  it("remove campos pesados (Conversa, Resumo, notas_caso, lawsuit_summary, image)", () => {
    const light = stripHeavyFields(fullRow);
    expect(light.Conversa).toBeUndefined();
    expect(light.Resumo).toBeUndefined();
    expect(light.notas_caso).toBeUndefined();
    expect(light.lawsuit_summary).toBeUndefined();
    expect(light.image).toBeUndefined();
  });

  it("preserva campos leves", () => {
    const light = stripHeavyFields(fullRow);
    expect(light.id).toBe(1);
    expect(light.CaseId).toBe(100);
    expect(light.CustumerName).toBe("João");
    expect(light.responsavel).toBe("Ana");
  });

  it("não muta o objeto original", () => {
    stripHeavyFields(fullRow);
    expect(fullRow.Conversa).toBe("texto longo...");
    expect(fullRow.Resumo).toBe("resumo longo...");
  });
});

// ---------------------------------------------------------------------------
// mapCaseRowLight
// ---------------------------------------------------------------------------

describe("mapCaseRowLight", () => {
  const drizzleRow = {
    id: 42,
    caseId: 100,
    custumerPhone: "5511999999999",
    custumerName: "Maria",
    data: "2026-03-03T12:00:00Z",
    etapaPerguntas: "sim",
    etapaFinal: null,
    depoimentoInicial: "não",
    iApause: null,
    bJCaseId: "BJ-123",
    institutionID: "5",
    responsavel: "Carlos",
    departmentId: "10",
    departmentName: "Jurídico",
    assignedToUserId: "7",
    valor: "1500.50",
    resultado: null,
    caseSource: "whatsapp",
    statusCaso: "ativo",
    cnjNumber: null,
    lawsuitTrackingActive: null,
    signEnvelopeId: null,
    signStatus: null,
    createdByUserId: "3",
    createdByUserName: "Admin",
  };

  it("mapeia campos Drizzle para formato Baserow", () => {
    const mapped = mapCaseRowLight(drizzleRow);
    expect(mapped.id).toBe(42);
    expect(mapped.CaseId).toBe(100);
    expect(mapped.CustumerPhone).toBe("5511999999999");
    expect(mapped.CustumerName).toBe("Maria");
    expect(mapped.BJCaseId).toBe("BJ-123");
    expect(mapped.InstitutionID).toBe(5);
    expect(mapped.responsavel).toBe("Carlos");
    expect(mapped.case_source).toBe("whatsapp");
  });

  it("converte IDs numéricos string → number", () => {
    const mapped = mapCaseRowLight(drizzleRow);
    expect(mapped.department_id).toBe(10);
    expect(mapped.assigned_to_user_id).toBe(7);
    expect(mapped.valor).toBe(1500.50);
    expect(mapped.created_by_user_id).toBe(3);
  });

  it("trata campos null como undefined", () => {
    const mapped = mapCaseRowLight(drizzleRow);
    expect(mapped.EtapaFinal).toBeUndefined();
    expect(mapped.IApause).toBeUndefined();
    expect(mapped.resultado).toBeUndefined();
    expect(mapped.cnj_number).toBeUndefined();
  });

  it("formata Data para padrão BR", () => {
    const mapped = mapCaseRowLight(drizzleRow);
    expect(mapped.Data).toBeDefined();
    expect(mapped.Data).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("não inclui campos pesados", () => {
    const mapped = mapCaseRowLight(drizzleRow);
    expect(mapped.Conversa).toBeUndefined();
    expect(mapped.Resumo).toBeUndefined();
    expect(mapped.notas_caso).toBeUndefined();
    expect(mapped.lawsuit_summary).toBeUndefined();
    expect(mapped.image).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildCaseSetObj
// ---------------------------------------------------------------------------

describe("buildCaseSetObj", () => {
  it("converte campos Baserow para formato Drizzle", () => {
    const set = buildCaseSetObj({
      CustumerPhone: "5511999999999",
      CustumerName: "João",
      InstitutionID: 5,
      responsavel: "Ana",
    });
    expect(set.custumerPhone).toBe("5511999999999");
    expect(set.custumerName).toBe("João");
    expect(set.institutionID).toBe("5");
    expect(set.responsavel).toBe("Ana");
  });

  it("converte valor numérico para string (Drizzle decimal)", () => {
    const set = buildCaseSetObj({ valor: 1500.50 });
    expect(set.valor).toBe("1500.5");
  });

  it("converte null para null (sem coerção)", () => {
    const set = buildCaseSetObj({
      InstitutionID: null as unknown as number,
      department_id: null as unknown as number,
    });
    expect(set.institutionID).toBeNull();
    expect(set.departmentId).toBeNull();
  });

  it("normaliza Single Select object para string", () => {
    const set = buildCaseSetObj({
      status_caso: { id: 1, value: "ativo", color: "green" } as unknown as string,
    });
    expect(set.statusCaso).toBe("ativo");
  });

  it("mantém string de status_caso diretamente", () => {
    const set = buildCaseSetObj({ status_caso: "encerrado" });
    expect(set.statusCaso).toBe("encerrado");
  });

  it("ignora campos undefined (não inclui no set)", () => {
    const set = buildCaseSetObj({ CustumerName: "Ana" });
    expect(Object.keys(set)).toEqual(["custumerName"]);
    expect(set).not.toHaveProperty("custumerPhone");
    expect(set).not.toHaveProperty("institutionID");
  });

  it("converte BJCaseId numérico para string", () => {
    const set = buildCaseSetObj({ BJCaseId: "BJ-456" });
    expect(set.bJCaseId).toBe("BJ-456");
  });
});

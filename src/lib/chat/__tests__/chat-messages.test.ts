import { describe, it, expect } from "vitest";
import {
  extractSenderValue,
  normalizeSender,
  inferSenderFromPhoneFields,
  guessKind,
  parseBrazilianDate,
  normalizeDate,
  normalizeCaseMessageRow,
  determineWabaNumberFromMessages,
  type BaserowCaseMessageRow,
} from "../baserow";
import type { CaseMessageAttachment } from "../types";

// ---------------------------------------------------------------------------
// extractSenderValue
// ---------------------------------------------------------------------------

describe("extractSenderValue", () => {
  it("retorna string diretamente", () => {
    expect(extractSenderValue("cliente")).toBe("cliente");
  });

  it("retorna vazio para null/undefined", () => {
    expect(extractSenderValue(null)).toBe("");
    expect(extractSenderValue(undefined)).toBe("");
  });

  it("extrai primeiro elemento de array de strings", () => {
    expect(extractSenderValue(["agente", "sistema"])).toBe("agente");
  });

  it("extrai value de array de objetos Baserow select", () => {
    expect(extractSenderValue([{ id: 1, value: "cliente" }])).toBe("cliente");
  });

  it("retorna vazio para array vazio", () => {
    expect(extractSenderValue([])).toBe("");
  });

  it("extrai value de objeto Baserow select", () => {
    expect(extractSenderValue({ id: 1, value: "bot" })).toBe("bot");
  });

  it("evita [object Object]", () => {
    expect(extractSenderValue([{}])).toBe("");
  });

  it("trata name como fallback quando value ausente", () => {
    expect(extractSenderValue({ name: "agente" })).toBe("agente");
  });
});

// ---------------------------------------------------------------------------
// normalizeSender
// ---------------------------------------------------------------------------

describe("normalizeSender", () => {
  it("normaliza variantes de cliente", () => {
    expect(normalizeSender("cliente")).toBe("cliente");
    expect(normalizeSender("Client")).toBe("cliente");
    expect(normalizeSender("CUSTOMER")).toBe("cliente");
  });

  it("normaliza variantes de agente", () => {
    expect(normalizeSender("agente")).toBe("agente");
    expect(normalizeSender("Agent")).toBe("agente");
    expect(normalizeSender("ATENDENTE")).toBe("agente");
  });

  it("normaliza variantes de bot/sistema", () => {
    expect(normalizeSender("bot")).toBe("bot");
    expect(normalizeSender("usuario")).toBe("bot");
    expect(normalizeSender("usuário")).toBe("bot");
    expect(normalizeSender("system")).toBe("bot");
    expect(normalizeSender("assistant")).toBe("bot");
  });

  it("valor desconhecido com conteúdo → bot", () => {
    expect(normalizeSender("outro-valor")).toBe("bot");
  });

  it("valor vazio → sistema", () => {
    expect(normalizeSender("")).toBe("sistema");
    expect(normalizeSender(null)).toBe("sistema");
    expect(normalizeSender(undefined)).toBe("sistema");
  });

  it("aceita input de array Baserow", () => {
    expect(normalizeSender(["cliente"])).toBe("cliente");
    expect(normalizeSender([{ value: "agente" }])).toBe("agente");
  });
});

// ---------------------------------------------------------------------------
// inferSenderFromPhoneFields
// ---------------------------------------------------------------------------

describe("inferSenderFromPhoneFields", () => {
  const makeRow = (from?: string, to?: string): BaserowCaseMessageRow => ({
    id: 1,
    from: from ?? null,
    to: to ?? null,
  });

  const customerPhone = "+55 11 99999-9999";

  it("from = cliente → sender = cliente", () => {
    const row = makeRow("5511999999999", "5511888888888");
    expect(inferSenderFromPhoneFields(row, customerPhone)).toBe("cliente");
  });

  it("to = cliente → sender = bot", () => {
    const row = makeRow("5511888888888", "5511999999999");
    expect(inferSenderFromPhoneFields(row, customerPhone)).toBe("bot");
  });

  it("retorna null sem customerPhone", () => {
    const row = makeRow("5511999999999", "5511888888888");
    expect(inferSenderFromPhoneFields(row, undefined)).toBeNull();
    expect(inferSenderFromPhoneFields(row, "")).toBeNull();
  });

  it("retorna null quando from/to não coincidem com cliente", () => {
    const row = makeRow("5511777777777", "5511888888888");
    expect(inferSenderFromPhoneFields(row, customerPhone)).toBeNull();
  });

  it("normaliza formatação de telefone (remove caracteres não-numéricos)", () => {
    const row = makeRow("+55 (11) 99999-9999", "+55 11 88888-8888");
    expect(inferSenderFromPhoneFields(row, customerPhone)).toBe("cliente");
  });
});

// ---------------------------------------------------------------------------
// guessKind
// ---------------------------------------------------------------------------

describe("guessKind", () => {
  const audioAtt: CaseMessageAttachment = {
    id: "1", name: "audio.ogg", size: 1024,
    mimeType: "audio/ogg", url: "", isImage: false,
  };
  const imageAtt: CaseMessageAttachment = {
    id: "2", name: "foto.jpg", size: 2048,
    mimeType: "image/jpeg", url: "", isImage: true,
  };
  const docAtt: CaseMessageAttachment = {
    id: "3", name: "doc.pdf", size: 4096,
    mimeType: "application/pdf", url: "", isImage: false,
  };
  const videoAtt: CaseMessageAttachment = {
    id: "4", name: "video.mp4", size: 8192,
    mimeType: "video/mp4", url: "", isImage: false,
  };

  it("sem attachments → text", () => {
    expect(guessKind([])).toBe("text");
  });

  it("sem attachments com fallback → usa fallback", () => {
    expect(guessKind([], "system")).toBe("system");
  });

  it("audio → audio", () => {
    expect(guessKind([audioAtt])).toBe("audio");
  });

  it("imagem → media", () => {
    expect(guessKind([imageAtt])).toBe("media");
  });

  it("vídeo → media", () => {
    expect(guessKind([videoAtt])).toBe("media");
  });

  it("documento → document (com fallback)", () => {
    expect(guessKind([docAtt])).toBe("document");
  });
});

// ---------------------------------------------------------------------------
// parseBrazilianDate
// ---------------------------------------------------------------------------

describe("parseBrazilianDate", () => {
  it("parseia DD/MM/YYYY HH:mm corretamente (BRT = UTC-3)", () => {
    const date = parseBrazilianDate("03/03/2026 15:30");
    expect(date).not.toBeNull();
    // BRT 15:30 = UTC 18:30
    expect(date!.getUTCHours()).toBe(18);
    expect(date!.getUTCMinutes()).toBe(30);
    expect(date!.getUTCDate()).toBe(3);
  });

  it("parseia DD/MM/YYYY HH:mm:ss", () => {
    const date = parseBrazilianDate("15/06/2026 08:45:30");
    expect(date).not.toBeNull();
    expect(date!.getUTCHours()).toBe(11); // 08 + 3
    expect(date!.getUTCMinutes()).toBe(45);
    expect(date!.getUTCSeconds()).toBe(30);
  });

  it("parseia DD/MM/YYYY, HH:mm (com vírgula)", () => {
    const date = parseBrazilianDate("25/12/2025, 23:00");
    expect(date).not.toBeNull();
    // BRT 23:00 + 3h = UTC 02:00 do dia seguinte
    expect(date!.getUTCDate()).toBe(26);
    expect(date!.getUTCHours()).toBe(2);
  });

  it("retorna null para formato inválido", () => {
    expect(parseBrazilianDate("2026-03-03T15:30:00Z")).toBeNull();
    expect(parseBrazilianDate("texto")).toBeNull();
    expect(parseBrazilianDate("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeDate
// ---------------------------------------------------------------------------

describe("normalizeDate", () => {
  it("normaliza formato brasileiro para ISO", () => {
    const result = normalizeDate("03/03/2026 15:30");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Verifica que é ISO válido
    expect(new Date(result).getTime()).not.toBeNaN();
  });

  it("normaliza formato ISO", () => {
    const iso = "2026-03-03T15:30:00.000Z";
    const result = normalizeDate(iso);
    expect(new Date(result).getTime()).toBe(new Date(iso).getTime());
  });

  it("retorna ISO atual para valor vazio", () => {
    const before = Date.now();
    const result = normalizeDate("");
    const after = Date.now();
    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before);
    expect(resultMs).toBeLessThanOrEqual(after);
  });

  it("retorna ISO atual para null/undefined", () => {
    const result = normalizeDate(null);
    expect(new Date(result).getTime()).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// normalizeCaseMessageRow (toCaseMessage via export)
// ---------------------------------------------------------------------------

describe("normalizeCaseMessageRow", () => {
  it("mapeia row completa para CaseMessage", () => {
    const row: BaserowCaseMessageRow = {
      id: 42,
      CaseId: "100",
      Message: "Olá, tudo bem?",
      from: "5511999999999",
      to: "5511888888888",
      SenderName: "João",
      DataHora: "03/03/2026 15:30",
      file: null,
      created_on: "2026-03-03T18:30:00.000Z",
    };

    const msg = normalizeCaseMessageRow(row, 100, "5511999999999");
    expect(msg.id).toBe(42);
    expect(msg.caseId).toBe(100);
    expect(msg.sender).toBe("cliente"); // from = customerPhone
    expect(msg.direction).toBe("inbound");
    expect(msg.content).toBe("Olá, tudo bem?");
    expect(msg.senderName).toBe("João");
    expect(msg.kind).toBe("text");
    expect(msg.deliveryStatus).toBe("delivered");
  });

  it("mensagem do bot (to = customerPhone)", () => {
    const row: BaserowCaseMessageRow = {
      id: 43,
      CaseId: "100",
      Message: "Resposta automática",
      from: "5511888888888",
      to: "5511999999999",
      file: null,
    };

    const msg = normalizeCaseMessageRow(row, 100, "5511999999999");
    expect(msg.sender).toBe("bot");
    expect(msg.direction).toBe("outbound");
    expect(msg.deliveryStatus).toBe("sent");
  });

  it("mensagem sem from/to usa Sender field", () => {
    const row: BaserowCaseMessageRow = {
      id: 44,
      CaseId: "100",
      Message: "Mensagem agente",
      Sender: "agente",
      from: null,
      to: null,
      file: null,
    };

    // Sem customerPhone → usa campo Sender
    const msg = normalizeCaseMessageRow(row, 100);
    expect(msg.sender).toBe("agente");
    expect(msg.direction).toBe("outbound");
  });

  it("trata attachments corretamente", () => {
    const row: BaserowCaseMessageRow = {
      id: 45,
      CaseId: "100",
      Message: "",
      from: "5511888888888",
      to: "5511999999999",
      file: [
        {
          name: "foto.jpg",
          url: "http://example.com/foto.jpg",
          mime_type: "image/jpeg",
          is_image: true,
          size: 2048,
        },
      ],
    };

    const msg = normalizeCaseMessageRow(row, 100, "5511999999999");
    expect(msg.kind).toBe("media");
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].name).toBe("foto.jpg");
    expect(msg.attachments[0].isImage).toBe(true);
  });

  it("mensagem vazia sem attachments → kind text", () => {
    const row: BaserowCaseMessageRow = {
      id: 46,
      CaseId: "100",
      Message: "",
      file: null,
    };

    const msg = normalizeCaseMessageRow(row, 100);
    // Sem Message e sem attachments → guessKind retorna fallback undefined → text
    expect(msg.kind).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// determineWabaNumberFromMessages
// ---------------------------------------------------------------------------

describe("determineWabaNumberFromMessages", () => {
  const makeMsg = (from: string, to: string): BaserowCaseMessageRow => ({
    id: 1,
    from,
    to,
    file: null,
  });

  it("identifica WABA quando from = cliente (to = WABA)", () => {
    const msgs = [makeMsg("5511999999999", "5511888888888")];
    expect(determineWabaNumberFromMessages(msgs, "5511999999999")).toBe("5511888888888");
  });

  it("identifica WABA quando to = cliente (from = WABA)", () => {
    const msgs = [makeMsg("5511888888888", "5511999999999")];
    expect(determineWabaNumberFromMessages(msgs, "5511999999999")).toBe("5511888888888");
  });

  it("retorna null sem customerPhone", () => {
    const msgs = [makeMsg("5511999999999", "5511888888888")];
    expect(determineWabaNumberFromMessages(msgs)).toBeNull();
  });

  it("retorna null sem mensagens", () => {
    expect(determineWabaNumberFromMessages([], "5511999999999")).toBeNull();
  });

  it("normaliza telefone com formatação", () => {
    const msgs = [makeMsg("+55 11 99999-9999", "+55 11 88888-8888")];
    expect(determineWabaNumberFromMessages(msgs, "+55 (11) 99999-9999")).toBe("5511888888888");
  });
});

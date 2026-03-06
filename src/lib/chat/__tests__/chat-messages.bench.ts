import { bench, describe } from "vitest";
import {
  extractSenderValue,
  normalizeSender,
  inferSenderFromPhoneFields,
  guessKind,
  parseBrazilianDate,
  normalizeDate,
  normalizeCaseMessageRow,
  type BaserowCaseMessageRow,
} from "../baserow";
import type { CaseMessageAttachment } from "../types";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const baseRow: BaserowCaseMessageRow = {
  id: 1,
  CaseId: "100",
  Message: "Mensagem de teste com conteúdo moderado para benchmark.",
  from: "5511999999999",
  to: "5511888888888",
  SenderName: "João da Silva",
  DataHora: "03/03/2026 15:30",
  file: null,
  created_on: "2026-03-03T18:30:00.000Z",
};

const rowWithAttachments: BaserowCaseMessageRow = {
  ...baseRow,
  id: 2,
  file: [
    {
      name: "foto1.jpg",
      url: "http://example.com/foto1.jpg",
      mime_type: "image/jpeg",
      is_image: true,
      size: 204800,
      thumbnails: {
        tiny: { url: "http://example.com/tiny/foto1.jpg" },
        small: { url: "http://example.com/small/foto1.jpg" },
      },
    },
    {
      name: "doc.pdf",
      url: "http://example.com/doc.pdf",
      mime_type: "application/pdf",
      is_image: false,
      size: 1048576,
    },
  ],
};

const audioAtt: CaseMessageAttachment = {
  id: "1", name: "audio.ogg", size: 1024,
  mimeType: "audio/ogg", url: "", isImage: false,
};

const imageAtt: CaseMessageAttachment = {
  id: "2", name: "foto.jpg", size: 2048,
  mimeType: "image/jpeg", url: "", isImage: true,
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("extractSenderValue", () => {
  bench("string direta", () => {
    extractSenderValue("cliente");
  });

  bench("array Baserow select", () => {
    extractSenderValue([{ id: 1, value: "agente", color: "blue" }]);
  });

  bench("null", () => {
    extractSenderValue(null);
  });
});

describe("normalizeSender", () => {
  bench("cliente", () => {
    normalizeSender("cliente");
  });

  bench("array select", () => {
    normalizeSender([{ value: "agente" }]);
  });

  bench("valor desconhecido", () => {
    normalizeSender("unknown-value");
  });
});

describe("inferSenderFromPhoneFields", () => {
  bench("match from = cliente", () => {
    inferSenderFromPhoneFields(baseRow, "+55 11 99999-9999");
  });

  bench("sem match", () => {
    inferSenderFromPhoneFields(baseRow, "+55 11 77777-7777");
  });

  bench("sem customerPhone", () => {
    inferSenderFromPhoneFields(baseRow, undefined);
  });
});

describe("guessKind", () => {
  bench("sem attachments", () => {
    guessKind([]);
  });

  bench("audio attachment", () => {
    guessKind([audioAtt]);
  });

  bench("image attachment", () => {
    guessKind([imageAtt]);
  });
});

describe("parseBrazilianDate", () => {
  bench("DD/MM/YYYY HH:mm", () => {
    parseBrazilianDate("03/03/2026 15:30");
  });

  bench("DD/MM/YYYY HH:mm:ss", () => {
    parseBrazilianDate("15/06/2026 08:45:30");
  });

  bench("formato inválido", () => {
    parseBrazilianDate("2026-03-03T15:30:00Z");
  });
});

describe("normalizeDate", () => {
  bench("formato brasileiro", () => {
    normalizeDate("03/03/2026 15:30");
  });

  bench("formato ISO", () => {
    normalizeDate("2026-03-03T15:30:00.000Z");
  });

  bench("vazio (fallback now)", () => {
    normalizeDate("");
  });
});

describe("normalizeCaseMessageRow", () => {
  bench("mensagem simples (texto)", () => {
    normalizeCaseMessageRow(baseRow, 100, "5511999999999");
  });

  bench("mensagem com 2 attachments", () => {
    normalizeCaseMessageRow(rowWithAttachments, 100, "5511999999999");
  });

  bench("mensagem sem customerPhone (usa Sender)", () => {
    normalizeCaseMessageRow(
      { ...baseRow, Sender: "agente", from: null, to: null },
      100,
    );
  });
});

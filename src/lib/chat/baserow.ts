import axios from "axios";

import type {
  CaseMessage,
  CaseMessageAttachment,
  CaseMessageKind,
  CaseMessageSender,
} from "./types";

type BaserowFileValue = {
  id?: number | string;
  name?: string;
  original_name?: string;
  url?: string;
  mime_type?: string;
  size?: number;
  is_image?: boolean;
  thumbnails?: Record<
    string,
    {
      url?: string;
    }
  >;
  uploaded_at?: string;
};

export type BaserowCaseMessageRow = {
  id: number;
  CaseId?: string | number | null;
  Sender?: string | null;
  DataHora?: string | null;
  Message?: string | null;
  file?: BaserowFileValue[] | null;
  from?: string | null;
  to?: string | null;
  created_on?: string | null;
  updated_on?: string | null;
  messages_type?: string | null;
  audioid?: string | null;
  imageId?: string | null;
  documentId?: string | null;
  [key: string]: unknown;
};

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ??
  process.env.NEXT_PUBLIC_BASEROW_API_URL ??
  "";

const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ??
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ??
  "";

const BASEROW_CASE_MESSAGES_TABLE_ID =
  Number(
    process.env.BASEROW_CASE_MESSAGES_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID,
  ) || 0;

const ensureBaserowConfig = () => {
  if (!BASEROW_API_URL || !BASEROW_API_KEY || !BASEROW_CASE_MESSAGES_TABLE_ID) {
    throw new Error(
      "Configuração do Baserow para mensagens não encontrada. Verifique as variáveis de ambiente.",
    );
  }
};

const buildMessagesUrl = (params: URLSearchParams) => {
  ensureBaserowConfig();
  const base = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/`;
  const searchParams = new URLSearchParams({
    user_field_names: "true",
    ...Object.fromEntries(params.entries()),
  });
  return `${base}?${searchParams.toString()}`;
};

const normalizeNextUrl = (value: unknown): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    const base = new URL(BASEROW_API_URL);
    const parsed = new URL(value, base);
    parsed.protocol = base.protocol;
    parsed.host = base.host;
    parsed.port = base.port;
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeAttachment = (value: BaserowFileValue): CaseMessageAttachment => {
  const thumbnailUrl = value.thumbnails?.small?.url ?? value.thumbnails?.tiny?.url;
  return {
    id: String(
      value.id ??
        value.url ??
        value.name ??
        `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    name: value.original_name ?? value.name ?? "arquivo",
    mimeType: value.mime_type ?? "application/octet-stream",
    size: Number(value.size ?? 0),
    url: value.url ?? "",
    previewUrl: thumbnailUrl,
    isImage: Boolean(value.is_image),
  };
};

const extractSenderValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  // Se é string, retorna diretamente
  if (typeof value === "string") {
    return value;
  }

  // If it's an array (Baserow multi-select or single-select returns array)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }
    const first = value[0];
    if (typeof first === "string") {
      return first;
    }
    if (typeof first === "object" && first !== null) {
      if (typeof first.value === "string" && first.value) {
        return first.value;
      }
      if (typeof first.name === "string" && first.name) {
        return first.name;
      }
    }
    const strValue = String(first);
    // Evitar "[object Object]"
    if (strValue === "[object Object]") {
      return "";
    }
    return strValue;
  }

  // If it's a Baserow select field object { id, value }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "string" && obj.value) {
      return obj.value;
    }
    if (typeof obj.name === "string" && obj.name) {
      return obj.name;
    }
    // Objeto sem value/name útil
    return "";
  }

  const strValue = String(value);
  // Evitar valores inválidos
  if (strValue === "[object Object]" || strValue === "undefined" || strValue === "null") {
    return "";
  }
  return strValue;
};

const normalizeSender = (value?: unknown): CaseMessageSender => {
  const extracted = extractSenderValue(value);
  const normalized = extracted.trim().toLowerCase();

  // Cliente = mensagens do cliente (lado esquerdo)
  if (
    normalized === "cliente" ||
    normalized === "client" ||
    normalized === "customer"
  ) {
    return "cliente";
  }

  // Agente humano
  if (
    normalized === "agente" ||
    normalized === "agent" ||
    normalized === "atendente"
  ) {
    return "agente";
  }

  // Usuário/Bot = mensagens automáticas da empresa (lado direito)
  if (
    normalized === "usuario" ||
    normalized === "usuário" ||
    normalized === "user" ||
    normalized === "bot" ||
    normalized === "sistema" ||
    normalized === "system" ||
    normalized === "assistant"
  ) {
    return "bot";
  }

  // Default: se tiver algum valor, considera como bot (empresa)
  // Se não tiver valor, considera sistema
  return extracted ? "bot" : "sistema";
};

const guessKind = (
  attachments: CaseMessageAttachment[],
  fallback?: CaseMessageKind,
): CaseMessageKind => {
  if (!attachments.length) {
    return fallback ?? "text";
  }
  const first = attachments[0];
  if (first.mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (first.mimeType.startsWith("image/") || first.isImage) {
    return "media";
  }
  if (first.mimeType.startsWith("video/")) {
    return "media";
  }
  return fallback ?? "document";
};

const parseBrazilianDate = (value: string): Date | null => {
  // Format: DD/MM/YYYY HH:mm or DD/MM/YYYY, HH:mm
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    );
  }
  return null;
};

const normalizeDate = (value?: string | null): string => {
  if (!value) {
    return new Date().toISOString();
  }

  // Try Brazilian format first (DD/MM/YYYY HH:mm)
  const brazilianDate = parseBrazilianDate(value.trim());
  if (brazilianDate && !Number.isNaN(brazilianDate.getTime())) {
    return brazilianDate.toISOString();
  }

  // Fallback to standard parsing
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
};

const normalizeMessageType = (
  value: string | null | undefined,
): CaseMessage["messageType"] | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const validTypes: CaseMessage["messageType"][] = ["text", "image", "audio", "document", "video"];
  return validTypes.includes(normalized as CaseMessage["messageType"])
    ? (normalized as CaseMessage["messageType"])
    : undefined;
};

const extractRawSender = (row: BaserowCaseMessageRow): unknown => {
  const rowData = row as Record<string, unknown>;

  // Tentar várias possibilidades de nome do campo
  const possibleFields = [
    "Sender",
    "sender",
    "SENDER",
    "Remetente",
    "remetente",
    "from_type",
    "fromType",
    "tipo",
    "Tipo",
    "type",
    "Type",
  ];

  for (const field of possibleFields) {
    if (rowData[field] !== undefined && rowData[field] !== null) {
      return rowData[field];
    }
  }

  return null;
};

// Determina o sender baseado nos campos from/to
// - Se "from" = telefone do cliente → mensagem enviada pelo cliente
// - Se "to" = telefone do cliente → mensagem enviada para o cliente (pelo bot)
const inferSenderFromPhoneFields = (
  row: BaserowCaseMessageRow,
  customerPhone?: string,
): CaseMessageSender | null => {
  if (!customerPhone) return null;

  const normalizedCustomerPhone = customerPhone.replace(/\D/g, "").trim();
  if (!normalizedCustomerPhone) return null;

  const rowFrom = row.from ? String(row.from).replace(/\D/g, "").trim() : "";
  const rowTo = row.to ? String(row.to).replace(/\D/g, "").trim() : "";

  // Se "from" é o cliente, então a mensagem é do cliente
  if (rowFrom && rowFrom === normalizedCustomerPhone) {
    return "cliente";
  }

  // Se "to" é o cliente, então a mensagem é do bot/empresa
  if (rowTo && rowTo === normalizedCustomerPhone) {
    return "bot";
  }

  return null;
};

type ToCaseMessageOptions = {
  customerPhone?: string;
};

const toCaseMessage = (
  row: BaserowCaseMessageRow,
  fallbackCaseId: number,
  options?: ToCaseMessageOptions,
): CaseMessage => {
  const attachments = Array.isArray(row.file)
    ? row.file.map(normalizeAttachment)
    : [];

  // PRIORIDADE 1: Usar campos from/to para determinar quem enviou (mais confiável)
  // Se "from" = telefone do cliente, a mensagem foi enviada pelo cliente
  // Se "to" = telefone do cliente, a mensagem foi enviada para o cliente (pelo bot)
  let sender: CaseMessageSender = "bot";

  if (options?.customerPhone) {
    const inferredSender = inferSenderFromPhoneFields(row, options.customerPhone);
    if (inferredSender) {
      sender = inferredSender;
    }
  }

  // PRIORIDADE 2: Se não conseguiu inferir por from/to, usa o campo Sender
  if (sender === "bot" && !options?.customerPhone) {
    const rawSender = extractRawSender(row);
    sender = normalizeSender(rawSender);
  }

  const direction = sender === "cliente" ? "inbound" : "outbound";
  const kind = guessKind(attachments, row.Message ? "text" : undefined);
  const createdAt = normalizeDate(row.DataHora ?? row.created_on);

  const message: CaseMessage = {
    id: row.id,
    caseId: fallbackCaseId,
    sender,
    direction,
    content: row.Message ?? "",
    createdAt,
    deliveryStatus: sender === "cliente" ? "delivered" : "sent",
    kind,
    attachments,
  };

  // Add optional fields if present
  const messageType = normalizeMessageType(row.messages_type);
  if (messageType) {
    message.messageType = messageType;
  }
  if (row.audioid) {
    message.audioId = row.audioid;
  }
  if (row.imageId) {
    message.imageId = row.imageId;
  }
  if (row.documentId) {
    message.documentId = row.documentId;
  }

  return message;
};

type FetchMessagesOptions = {
  caseIdentifiers?: Array<string | number>;
  customerPhone?: string;
  fallbackCaseId: number;
};

export type FetchMessagesResult = {
  messages: CaseMessage[];
  wabaPhoneNumber: string | null;
};

export const fetchCaseMessagesFromBaserow = async (
  options: FetchMessagesOptions,
): Promise<FetchMessagesResult> => {
  ensureBaserowConfig();

  const { caseIdentifiers = [], customerPhone, fallbackCaseId } = options;

  // Normalize customer phone (remove non-digits)
  const normalizedPhone = customerPhone
    ? customerPhone.replace(/\D/g, "").trim()
    : "";

  const normalizedIdentifiers = caseIdentifiers
    .map((value) => String(value).trim())
    .filter(Boolean);

  // If no phone and no identifiers, return empty
  if (!normalizedPhone && !normalizedIdentifiers.length) {
    return { messages: [], wabaPhoneNumber: null };
  }

  const pageSize = 200;
  const collected: BaserowCaseMessageRow[] = [];

  const headers = {
    Authorization: `Token ${BASEROW_API_KEY}`,
    "Content-Type": "application/json",
  };

  // Helper: pagina todas as rows de uma URL
  const fetchAllPages = async (initialUrl: string): Promise<BaserowCaseMessageRow[]> => {
    const rows: BaserowCaseMessageRow[] = [];
    let nextUrl: string | null = initialUrl;
    while (nextUrl) {
      const response = await axios.get(nextUrl, { headers, timeout: 30000 });
      const pageRows: BaserowCaseMessageRow[] = Array.isArray(response.data?.results)
        ? response.data.results
        : [];
      rows.push(...pageRows);
      nextUrl = normalizeNextUrl(response.data?.next);
    }
    return rows;
  };

  // Buscar por telefone (from e to) em PARALELO
  if (normalizedPhone) {
    const fromUrl = buildMessagesUrl(new URLSearchParams({
      page: "1",
      size: String(pageSize),
      order_by: "DataHora",
      "filter__from__contains": normalizedPhone,
    }));
    const toUrl = buildMessagesUrl(new URLSearchParams({
      page: "1",
      size: String(pageSize),
      order_by: "DataHora",
      "filter__to__contains": normalizedPhone,
    }));

    const [fromRows, toRows] = await Promise.all([
      fetchAllPages(fromUrl),
      fetchAllPages(toUrl),
    ]);
    collected.push(...fromRows, ...toRows);
  }

  // Se não encontrou por telefone, buscar por CaseId (em paralelo)
  if (!collected.length && normalizedIdentifiers.length) {
    const identifierPromises = normalizedIdentifiers.map((identifier) => {
      const url = buildMessagesUrl(new URLSearchParams({
        page: "1",
        size: String(pageSize),
        order_by: "DataHora",
        "filter__CaseId__equal": identifier,
      }));
      return fetchAllPages(url);
    });
    const results = await Promise.all(identifierPromises);
    for (const rows of results) {
      collected.push(...rows);
    }
  }

  // Remove duplicates by id
  const uniqueMap = new Map<number, BaserowCaseMessageRow>();
  for (const row of collected) {
    if (!uniqueMap.has(row.id)) {
      uniqueMap.set(row.id, row);
    }
  }
  const unique = Array.from(uniqueMap.values());

  const parseDateForSort = (value: string | null | undefined): number => {
    if (!value) return 0;
    const trimmed = value.trim();
    // Try Brazilian format first
    const brazilianDate = parseBrazilianDate(trimmed);
    if (brazilianDate && !Number.isNaN(brazilianDate.getTime())) {
      return brazilianDate.getTime();
    }
    // Fallback to standard parsing
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
    return 0;
  };

  unique.sort((a, b) => {
    const dateA = parseDateForSort(a.DataHora ?? a.created_on);
    const dateB = parseDateForSort(b.DataHora ?? b.created_on);

    // First sort by date
    if (dateA !== dateB) {
      return dateA - dateB;
    }

    // If same date, sort by id (higher id = more recent)
    return a.id - b.id;
  });

  // Determinar o número WABA da conversa
  const wabaPhoneNumber = determineWabaNumberFromMessages(unique, normalizedPhone);

  return {
    messages: unique.map((row) => toCaseMessage(row, fallbackCaseId, { customerPhone: normalizedPhone })),
    wabaPhoneNumber,
  };
};

export const uploadAttachmentToBaserow = async (
  file: File | Blob,
  filename?: string,
): Promise<BaserowFileValue> => {
  ensureBaserowConfig();
  const uploadUrl = `${BASEROW_API_URL}/user-files/upload-file/`;

  const formData = new FormData();
  if (file instanceof File) {
    formData.append("file", file, filename ?? file.name);
  } else {
    const generatedName = filename ?? `anexo-${Date.now()}.bin`;
    formData.append("file", file, generatedName);
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Erro desconhecido");
    throw new Error(`Falha ao enviar arquivo para o Baserow: ${errorText}`);
  }

  const payload = (await response.json()) as BaserowFileValue;
  return payload;
};

type CreateCaseMessageRowInput = {
  caseIdentifier: string | number;
  sender: CaseMessageSender;
  content: string;
  attachments?: BaserowFileValue[];
  timestamp?: string;
  from?: string;
  to?: string;
  messages_type?: string;
  field?: string;
  audioid?: string;
  imageId?: string;
  documentId?: string;
};

export const createCaseMessageRow = async (input: CreateCaseMessageRowInput) => {
  ensureBaserowConfig();

  const payload: Record<string, unknown> = {
    CaseId: String(input.caseIdentifier),
    Sender: input.sender,
    Message: input.content,
    DataHora: input.timestamp ?? new Date().toISOString(),
    field: input.field ?? "chat",
  };

  if (input.attachments?.length) {
    payload.file = input.attachments;
  }

  if (input.from) {
    payload.from = input.from;
  }

  if (input.to) {
    payload.to = input.to;
  }

  if (input.messages_type) {
    payload.messages_type = input.messages_type;
  }

  if (input.audioid) {
    payload.audioid = input.audioid;
  }

  if (input.imageId) {
    payload.imageId = input.imageId;
  }

  if (input.documentId) {
    payload.documentId = input.documentId;
  }

  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return response.data as BaserowCaseMessageRow;
};

export const normalizeCaseMessageRow = (
  row: BaserowCaseMessageRow,
  fallbackCaseId: number,
  customerPhone?: string,
): CaseMessage => toCaseMessage(row, fallbackCaseId, { customerPhone });

/**
 * Determina o número WABA usado em uma conversa a partir das mensagens.
 * Analisa os campos `from` e `to` para identificar qual é o número WABA
 * (o que não é o telefone do cliente).
 */
export const determineWabaNumberFromMessages = (
  messages: BaserowCaseMessageRow[],
  customerPhone?: string,
): string | null => {
  if (!messages.length) return null;

  const normalizedCustomerPhone = customerPhone
    ? customerPhone.replace(/\D/g, "").trim()
    : "";

  for (const msg of messages) {
    const from = msg.from ? String(msg.from).replace(/\D/g, "").trim() : "";
    const to = msg.to ? String(msg.to).replace(/\D/g, "").trim() : "";

    // Se temos o telefone do cliente, podemos identificar o WABA
    if (normalizedCustomerPhone) {
      // Se from é o cliente, to é o WABA
      if (from === normalizedCustomerPhone && to) {
        return to;
      }
      // Se to é o cliente, from é o WABA
      if (to === normalizedCustomerPhone && from) {
        return from;
      }
    }

    // Se não temos o telefone do cliente, usamos heurística
    // Mensagens enviadas (não do cliente) têm from = WABA
    if (from && msg.Sender !== "cliente") {
      return from;
    }
  }

  return null;
};

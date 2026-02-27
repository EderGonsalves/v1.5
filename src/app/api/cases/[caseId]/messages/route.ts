import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { convertAudioToOggOpus } from "@/lib/audio-converter";
import { isCasePaused } from "@/lib/case-stats";
import {
  createCaseMessageRow,
  fetchCaseMessagesFromBaserow,
  normalizeCaseMessageRow,
  uploadAttachmentToBaserow,
} from "@/lib/chat/baserow";
import type {
  CaseMessage,
  CaseMessageKind,
  CaseMessageSender,
} from "@/lib/chat/types";
import { getBaserowCaseById, updateBaserowCase } from "@/services/api";
import type { BaserowCaseRow } from "@/services/api";
import { getInstitutionWabaPhoneNumber } from "@/lib/waba";

type RouteParams = {
  caseId: string;
};

type RouteContext = {
  params: RouteParams | Promise<RouteParams>;
};

const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL ?? "";
const CHAT_WEBHOOK_TOKEN = process.env.CHAT_WEBHOOK_TOKEN ?? "";
const CHAT_WEBHOOK_TIMEOUT =
  Number(process.env.CHAT_WEBHOOK_TIMEOUT_MS ?? 20000) || 20000;

/**
 * Gera um ETag leve a partir de count + timestamp da última mensagem.
 * Suficiente para detectar mensagens novas sem hash caro.
 */
const computeMessagesETag = (count: number, lastMessageAt: string | null): string => {
  return `"msgs-${count}-${lastMessageAt ?? "0"}"`;
};

const formatDateTimeBR = (date: Date): string => {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const day = String(brt.getUTCDate()).padStart(2, "0");
  const month = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const year = brt.getUTCFullYear();
  const hours = String(brt.getUTCHours()).padStart(2, "0");
  const minutes = String(brt.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const legacyPrefixPatterns: Array<{
  pattern: RegExp;
  sender: CaseMessageSender;
}> = [
  { pattern: /^Cliente\s*:/i, sender: "cliente" },
  { pattern: /^Mensagem\s+User\s*:/i, sender: "cliente" },
  { pattern: /^Agente\s*:/i, sender: "agente" },
  { pattern: /^Mensagem\s+Bot\s*:/i, sender: "bot" },
];

const parseCaseIdParam = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const buildCaseIdentifiers = (
  caseRow: BaserowCaseRow,
  rowId: number,
): Array<string | number> => {
  const identifiers: Array<string | number> = [];
  if (caseRow.CaseId !== null && caseRow.CaseId !== undefined) {
    identifiers.push(caseRow.CaseId);
  }
  // Só adicionar rowId se diferente do CaseId (evita duplicata que força inArray em vez de prepared stmt)
  if (String(caseRow.CaseId) !== String(rowId)) {
    identifiers.push(rowId);
  }
  return identifiers;
};

const computeLastClientMessageAt = (
  messages: CaseMessage[],
): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const current = messages[index];
    if (current.sender === "cliente") {
      return current.createdAt;
    }
  }
  return null;
};

const computeSessionDeadline = (lastClientMessageAt: string | null): string | null => {
  if (!lastClientMessageAt) {
    return null;
  }
  const reference = new Date(lastClientMessageAt);
  if (Number.isNaN(reference.getTime())) {
    return null;
  }
  return new Date(reference.getTime() + 24 * 60 * 60 * 1000).toISOString();
};

const formatConversationLine = ({
  sender,
  senderName,
  timestamp,
  content,
  attachmentNames,
}: {
  sender: CaseMessageSender;
  senderName?: string;
  timestamp: string;
  content: string;
  attachmentNames: string[];
}) => {
  const actorLabel = sender === "cliente"
    ? "Cliente"
    : senderName || "Agente";
  const formattedTimestamp = new Date(timestamp).toLocaleString("pt-BR", {
    timeStyle: "short",
    dateStyle: "short",
  });
  const attachmentSuffix = attachmentNames.length
    ? ` [Anexos: ${attachmentNames.join(", ")}]`
    : "";
  const baseContent = content.trim() || (attachmentNames.length ? "Enviou um anexo" : "");
  return `${actorLabel} (${formattedTimestamp}): ${baseContent}${attachmentSuffix}`.trim();
};

const appendConversationEntry = (
  legacyConversation: string | null | undefined,
  newEntry: string,
): string => {
  if (!legacyConversation || !legacyConversation.trim()) {
    return newEntry;
  }
  return `${legacyConversation.trim()}\n${newEntry}`;
};

const convertLegacyConversation = (
  conversation: string,
  caseRowId: number,
  baseDate?: string | null,
): CaseMessage[] => {
  if (!conversation.trim()) {
    return [];
  }

  const lines = conversation
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  type LegacyMessage = {
    sender: CaseMessageSender;
    content: string;
  };

  const collected: LegacyMessage[] = [];
  let current: LegacyMessage | null = null;

  for (const line of lines) {
    if (/^(null|undefined)$/i.test(line)) {
      continue;
    }

    const matched = legacyPrefixPatterns.find(({ pattern }) =>
      pattern.test(line),
    );

    if (matched) {
      if (current) {
        collected.push(current);
      }
      const normalizedContent = line.replace(matched.pattern, "").trim();
      current = {
        sender: matched.sender,
        content: normalizedContent,
      };
      continue;
    }

    if (current) {
      current.content = `${current.content} ${line}`.trim();
    }
  }

  if (current) {
    collected.push(current);
  }

  if (!collected.length) {
    return [];
  }

  const referenceDate = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(referenceDate.getTime())) {
    referenceDate.setTime(Date.now());
  }

  return collected.map((entry, index) => {
    const createdAt = new Date(referenceDate.getTime() + index * 60 * 1000);
    const direction = entry.sender === "cliente" ? "inbound" : "outbound";
    return {
      id: 0 - index,
      caseId: caseRowId,
      sender: entry.sender,
      direction,
      content: entry.content,
      createdAt: createdAt.toISOString(),
      deliveryStatus: direction === "inbound" ? "delivered" : "sent",
      kind: "text" as CaseMessageKind,
      attachments: [],
    };
  });
};

const readFilesFromFormData = (formData: FormData, field: string): File[] => {
  return formData
    .getAll(field)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
};

type MessageType = "text" | "image" | "audio" | "document" | "video";

/** MIME types aceitos pela API do WhatsApp Business (Cloud API) */
const WHATSAPP_MIME_TYPES = new Set([
  // Imagens
  "image/jpeg",
  "image/png",
  // Áudio
  "audio/aac",
  "audio/amr",
  "audio/mpeg",       // mp3
  "audio/mp4",        // m4a
  "audio/ogg",        // ogg (codec opus)
  // Vídeo
  "video/mp4",
  "video/3gpp",
  // Documentos
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

/**
 * Normaliza o MIME type removendo parâmetros de codec (ex: "audio/ogg; codecs=opus" → "audio/ogg").
 * Não remapeia entre formatos diferentes para evitar mismatch entre MIME declarado e conteúdo real.
 */
const normalizeWhatsAppMime = (mime: string): string => {
  // Remove parâmetros de codec: "audio/ogg; codecs=opus" → "audio/ogg"
  const base = mime.split(";")[0].trim();
  return base;
};

type ChatWebhookPayload = {
  display_phone_number: string;
  to: string;
  text: string;
  DataHora: string;
  field: string;
  messages_type: MessageType;
  audioid?: string;
  imageId?: string;
  documentId?: string;
  type?: "ghost";
  mediaUrl?: string;
  mediaFilename?: string;
  mediaMimeType?: string;
};

const dispatchChatWebhook = async (payload: ChatWebhookPayload) => {
  if (!CHAT_WEBHOOK_URL) {
    console.warn(
      "CHAT_WEBHOOK_URL não definido. Mensagem será registrada somente no Baserow.",
    );
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_WEBHOOK_TIMEOUT);

  try {
    const response = await fetch(CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CHAT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${CHAT_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Erro desconhecido");
      throw new Error(
        `Webhook respondeu com status ${response.status}: ${errorText}`,
      );
    }

    return response.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }
};

const detectKindFromFiles = (files: File[], fallback: CaseMessageKind): CaseMessageKind => {
  if (!files.length) {
    return fallback;
  }
  const first = files[0];
  if (first.type.startsWith("audio/")) {
    return "audio";
  }
  if (first.type.startsWith("image/") || first.type.startsWith("video/")) {
    return "media";
  }
  return "document";
};

const allowedKinds: CaseMessageKind[] = ["text", "media", "audio", "document", "system"];

const parseKindValue = (
  value: FormDataEntryValue | null,
  attachments: File[],
): CaseMessageKind => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (allowedKinds.includes(normalized as CaseMessageKind)) {
      return normalized as CaseMessageKind;
    }
  }
  return detectKindFromFiles(attachments, "text");
};

// ── Cache de contexto do caso (evita buscar metadados a cada poll) ──────────
type CaseContextSuccess = { caseRow: BaserowCaseRow; identifiers: Array<string | number>; rowId: number };
type CaseContextResult = CaseContextSuccess | { error: NextResponse };

const _caseContextCache = new Map<number, { data: CaseContextSuccess; ts: number }>();
const CASE_CTX_CACHE_TTL = 120_000; // 120s — metadados de caso não mudam durante polling

const ensureCaseContext = async (caseIdParam: string): Promise<CaseContextResult> => {
  const parsedId = parseCaseIdParam(caseIdParam);
  if (!parsedId) {
    return { error: NextResponse.json({ error: "invalid_case_id" }, { status: 400 }) };
  }

  // Check cache first
  const cached = _caseContextCache.get(parsedId);
  if (cached && Date.now() - cached.ts < CASE_CTX_CACHE_TTL) {
    return cached.data;
  }

  const caseRow = await getBaserowCaseById(parsedId);
  if (!caseRow) {
    return { error: NextResponse.json({ error: "case_not_found" }, { status: 404 }) };
  }

  const identifiers = buildCaseIdentifiers(caseRow, parsedId);
  const result: CaseContextSuccess = { caseRow, identifiers, rowId: parsedId };

  // Cache the result
  _caseContextCache.set(parsedId, { data: result, ts: Date.now() });
  // Evitar memory leak
  if (_caseContextCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _caseContextCache) {
      if (now - v.ts > CASE_CTX_CACHE_TTL) _caseContextCache.delete(k);
    }
  }

  return result;
};

const resolveRouteParams = async (context: RouteContext): Promise<RouteParams> => {
  return context.params instanceof Promise ? context.params : context.params;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const params = await resolveRouteParams(context);
    const resolved = await ensureCaseContext(params.caseId);
    if ("error" in resolved) {
      return resolved.error;
    }

    const { caseRow, identifiers, rowId } = resolved;
    const customerPhone = caseRow.CustumerPhone ? String(caseRow.CustumerPhone).trim() : "";

    // ── Incremental polling: ?since_id=N returns only new messages ────
    const sinceIdParam = request.nextUrl.searchParams.get("since_id");
    const sinceId = sinceIdParam ? Number(sinceIdParam) : 0;

    if (sinceId > 0) {
      const fetchResult = await fetchCaseMessagesFromBaserow({
        caseIdentifiers: identifiers,
        customerPhone,
        fallbackCaseId: rowId,
        sinceId,
      });

      return NextResponse.json({
        messages: fetchResult.messages,
        meta: {
          total: fetchResult.messages.length,
          incremental: true,
        },
      });
    }

    // ── Full load (initial) ──────────────────────────────────────────
    const fetchResult = await fetchCaseMessagesFromBaserow({
      caseIdentifiers: identifiers,
      customerPhone,
      fallbackCaseId: rowId,
    });
    let messages = fetchResult.messages;
    let conversationWabaNumber = fetchResult.wabaPhoneNumber;
    let legacyFallbackUsed = false;

    if (!messages.length && caseRow.Conversa) {
      messages = convertLegacyConversation(
        caseRow.Conversa,
        rowId,
        caseRow.Data ?? caseRow.data,
      );
      legacyFallbackUsed = true;
      conversationWabaNumber = null; // Conversas legadas não têm número WABA
    }

    const lastClientMessageAt = computeLastClientMessageAt(messages);
    const sessionDeadline = computeSessionDeadline(lastClientMessageAt);
    const lastMessageAt = messages.length
      ? messages[messages.length - 1].createdAt
      : null;

    // ETag: permite 304 Not Modified quando nada mudou
    const etag = computeMessagesETag(messages.length, lastMessageAt);
    const clientETag = request.headers.get("if-none-match");
    if (clientETag && clientETag === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return NextResponse.json(
      {
        case: {
          id: caseRow.id,
          caseIdentifier: identifiers[0] ?? rowId,
          customerName: caseRow.CustumerName ?? "Cliente",
          customerPhone: caseRow.CustumerPhone ?? "",
          paused: isCasePaused(caseRow),
          bjCaseId: caseRow.BJCaseId ?? null,
          wabaPhoneNumber: conversationWabaNumber,
        },
        messages,
        meta: {
          total: messages.length,
          lastClientMessageAt,
          lastMessageAt,
          sessionDeadline,
          legacyFallbackUsed,
        },
      },
      { headers: { ETag: etag } },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error("[chat] Falha ao listar mensagens do caso:", errMsg, errStack ?? "");
    return NextResponse.json(
      {
        error: "Erro ao carregar mensagens",
        detail: process.env.NODE_ENV === "development" ? errMsg : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const params = await resolveRouteParams(context);
    const resolved = await ensureCaseContext(params.caseId);
    if ("error" in resolved) {
      return resolved.error;
    }

    const { caseRow, identifiers, rowId } = resolved;
    const formData = await request.formData();
    const rawContent = formData.get("content");
    const senderInput = (formData.get("sender") ?? "agente").toString();
    const sender = (["cliente", "bot", "agente"].includes(
      senderInput.toLowerCase(),
    )
      ? senderInput.toLowerCase()
      : "agente") as CaseMessageSender;

    const attachments = [
      ...readFilesFromFormData(formData, "attachments"),
      ...readFilesFromFormData(formData, "audio"),
    ];

    const content =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!content && !attachments.length) {
      return NextResponse.json(
        {
          error: "empty_message",
          message: "Envie um texto, áudio ou anexo para continuar.",
        },
        { status: 400 },
      );
    }

    const kind = parseKindValue(formData.get("kind"), attachments);

    // Check for ghost message type
    const messageTypeInput = formData.get("type");
    const isGhostMessage = messageTypeInput === "ghost";

    const quotedMessageIdRaw = formData.get("quotedMessageId");
    const quotedMessageId =
      typeof quotedMessageIdRaw === "string" && quotedMessageIdRaw
        ? Number(quotedMessageIdRaw)
        : null;

    // Get WABA phone number - prefer explicit parameter, then case field, then institution default
    const rawInstitutionId = caseRow.InstitutionID ?? caseRow["body.auth.institutionId"];
    const institutionId = rawInstitutionId ? Number(String(rawInstitutionId).trim()) : undefined;

    const explicitWabaNumber = formData.get("wabaPhoneNumber");
    const caseWabaNumber = caseRow.display_phone_number;

    let wabaPhoneNumber: string | null = null;
    if (typeof explicitWabaNumber === "string" && explicitWabaNumber.trim()) {
      // Usar número explícito enviado pelo cliente (quando há múltiplos números)
      wabaPhoneNumber = explicitWabaNumber.trim();
    } else if (caseWabaNumber && typeof caseWabaNumber === "string") {
      // Usar número associado ao caso
      wabaPhoneNumber = caseWabaNumber.trim();
    } else {
      // Fallback: buscar número padrão da instituição
      wabaPhoneNumber = await getInstitutionWabaPhoneNumber(institutionId);
    }

    const customerPhone = caseRow.CustumerPhone ? String(caseRow.CustumerPhone).trim() : "";

    // Converter áudios para OGG/OPUS (formato nativo do WhatsApp) antes do upload
    const processedAttachments: File[] = [];
    for (const file of attachments) {
      const baseMime = (file.type || "").split(";")[0].trim();
      if (baseMime.startsWith("audio/") && baseMime !== "audio/ogg") {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await convertAudioToOggOpus(buffer, file.type, file.name);
        processedAttachments.push(
          new File([new Uint8Array(result.buffer)], result.filename, { type: result.mimeType }),
        );
      } else {
        processedAttachments.push(file);
      }
    }

    const originalMimeTypes = processedAttachments.map(
      (file) => file.type || "application/octet-stream",
    );

    const uploadedAttachments = await Promise.all(
      processedAttachments.map((file) =>
        uploadAttachmentToBaserow(file, file.name || undefined),
      ),
    );

    const timestamp = formatDateTimeBR(new Date());
    let newMessage: CaseMessage;
    // Determine message type based on original file MIME (not Baserow's detection)
    const determineMessageType = (originalMimes: string[]): MessageType => {
      if (!originalMimes.length) return "text";
      const mime = originalMimes[0];
      if (mime.startsWith("audio/")) return "audio";
      if (mime.startsWith("image/")) return "image";
      if (mime.startsWith("video/")) return "video";
      return "document";
    };

    const messageType = determineMessageType(originalMimeTypes);
    const fieldValue = isGhostMessage ? "ghost" : "chat";

    // Extract imageId, audioid or documentId from uploaded files
    const getMediaId = (files: typeof uploadedAttachments, type: "image" | "audio" | "document"): string | undefined => {
      const idx = originalMimeTypes.findIndex((mime) => {
        if (type === "image") return mime.startsWith("image/");
        if (type === "audio") return mime.startsWith("audio/");
        if (type === "document") {
          return !mime.startsWith("image/") &&
                 !mime.startsWith("audio/") &&
                 !mime.startsWith("video/");
        }
        return false;
      });
      return idx >= 0 ? (files[idx]?.name ?? undefined) : undefined;
    };

    // Resolver nome do usuário para mensagens de agente humano
    const senderName =
      sender === "agente" || sender === "bot"
        ? (typeof auth.payload?.name === "string" && auth.payload.name.trim()) ||
          auth.legacyUserId ||
          "Agente"
        : undefined;

    // 1. Salvar mensagem diretamente no Baserow (sem depender do N8N)
    const createdRow = await createCaseMessageRow({
      caseIdentifier: identifiers[0] ?? rowId,
      sender,
      senderName,
      content,
      attachments: uploadedAttachments,
      timestamp,
      from: wabaPhoneNumber ?? undefined,
      to: customerPhone || undefined,
      messages_type: messageType,
      field: fieldValue,
      audioid: messageType === "audio" ? getMediaId(uploadedAttachments, "audio") : undefined,
      imageId: messageType === "image" ? getMediaId(uploadedAttachments, "image") : undefined,
      documentId: messageType === "document" ? getMediaId(uploadedAttachments, "document") : undefined,
    });

    newMessage = normalizeCaseMessageRow(createdRow, rowId, customerPhone);

    if (isGhostMessage) {
      newMessage.metadata = { ...newMessage.metadata, type: "ghost" };
    }

    // 2. Dispatch webhook para envio do WhatsApp (fire-and-forget — não bloqueia resposta)
    if (wabaPhoneNumber && customerPhone && (content || uploadedAttachments.length)) {
      const now = new Date();
      const webhookPayload: ChatWebhookPayload = {
        display_phone_number: wabaPhoneNumber,
        to: customerPhone,
        text: content,
        DataHora: formatDateTimeBR(now),
        field: fieldValue,
        messages_type: messageType,
      };

      if (messageType === "image") {
        webhookPayload.imageId = getMediaId(uploadedAttachments, "image");
      } else if (messageType === "audio") {
        webhookPayload.audioid = getMediaId(uploadedAttachments, "audio");
      } else if (messageType === "document") {
        webhookPayload.documentId = getMediaId(uploadedAttachments, "document");
      }

      if (uploadedAttachments.length > 0) {
        const firstFile = uploadedAttachments[0];
        const rawUrl = firstFile.url ?? "";
        const mime = normalizeWhatsAppMime(originalMimeTypes[0]);
        const origin = process.env.APP_URL?.replace(/\/+$/, "") || request.nextUrl.origin;
        const proxyUrl = `${origin}/api/media/proxy?url=${encodeURIComponent(rawUrl)}&type=${encodeURIComponent(mime)}`;

        webhookPayload.mediaUrl = proxyUrl;
        webhookPayload.mediaFilename = firstFile.original_name ?? firstFile.name ?? undefined;
        webhookPayload.mediaMimeType = mime;
      }

      if (isGhostMessage) {
        webhookPayload.type = "ghost";
      }

      // Fire-and-forget: não espera resposta do N8N
      dispatchChatWebhook(webhookPayload).catch((err) =>
        console.error("[chat] Falha ao enviar webhook WhatsApp (fire-and-forget):", err),
      );
    }

    const attachmentNames = uploadedAttachments
      .map((file) => file.original_name ?? file.name)
      .filter((name): name is string => Boolean(name));

    const conversationLine = formatConversationLine({
      sender,
      senderName,
      timestamp,
      content,
      attachmentNames,
    });

    await updateBaserowCase(caseRow.id, {
      Conversa: appendConversationEntry(caseRow.Conversa, conversationLine),
    });

    const lastClientMessageAt = sender === "cliente" ? newMessage.createdAt : null;
    const sessionDeadline = computeSessionDeadline(lastClientMessageAt);

    return NextResponse.json({
      message: newMessage,
      case: {
        id: caseRow.id,
        paused: isCasePaused(caseRow),
      },
      meta: {
        lastClientMessageAt,
        sessionDeadline,
      },
    });
  } catch (error) {
    console.error("[chat] Falha ao registrar mensagem do caso:", error);
    return NextResponse.json(
      {
        error: "Erro ao enviar mensagem",
      },
      { status: 500 },
    );
  }
}

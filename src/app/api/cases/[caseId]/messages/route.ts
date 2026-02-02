import { NextRequest, NextResponse } from "next/server";

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
import { getBaserowCaseById, getBaserowConfigs, updateBaserowCase } from "@/services/api";
import type { BaserowCaseRow, BaserowConfigRow } from "@/services/api";

const getWabaPhoneNumber = async (institutionId?: number): Promise<string | null> => {
  try {
    // Get configs filtered by institutionId (same as conexoes page)
    const configs = await getBaserowConfigs(institutionId);

    if (!configs.length) {
      return null;
    }

    // Find config with waba_phone_number (same pattern as conexoes page)
    for (const config of configs) {
      const phoneNumber = (config as Record<string, unknown>).waba_phone_number;
      if (phoneNumber) {
        const normalizedPhone = typeof phoneNumber === "string"
          ? phoneNumber.trim()
          : String(phoneNumber);
        if (normalizedPhone) {
          return normalizedPhone;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
};

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

const formatDateTimeBR = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
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
  identifiers.push(rowId);
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
  timestamp,
  content,
  attachmentNames,
}: {
  sender: CaseMessageSender;
  timestamp: string;
  content: string;
  attachmentNames: string[];
}) => {
  const actorLabel = sender === "cliente" ? "Cliente" : "Agente";
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

const ensureCaseContext = async (caseIdParam: string) => {
  const parsedId = parseCaseIdParam(caseIdParam);
  if (!parsedId) {
    return { error: NextResponse.json({ error: "invalid_case_id" }, { status: 400 }) };
  }

  const caseRow = await getBaserowCaseById(parsedId);
  if (!caseRow) {
    return { error: NextResponse.json({ error: "case_not_found" }, { status: 404 }) };
  }

  const identifiers = buildCaseIdentifiers(caseRow, parsedId);
  return { caseRow, identifiers, rowId: parsedId };
};

const resolveRouteParams = async (context: RouteContext): Promise<RouteParams> => {
  return context.params instanceof Promise ? context.params : context.params;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const params = await resolveRouteParams(context);
    const resolved = await ensureCaseContext(params.caseId);
    if ("error" in resolved) {
      return resolved.error;
    }

    const { caseRow, identifiers, rowId } = resolved;
    const customerPhone = caseRow.CustumerPhone ? String(caseRow.CustumerPhone).trim() : "";

    let messages = await fetchCaseMessagesFromBaserow({
      caseIdentifiers: identifiers,
      customerPhone,
      fallbackCaseId: rowId,
    });
    let legacyFallbackUsed = false;

    if (!messages.length && caseRow.Conversa) {
      messages = convertLegacyConversation(
        caseRow.Conversa,
        rowId,
        caseRow.Data ?? caseRow.data,
      );
      legacyFallbackUsed = true;
    }

    const lastClientMessageAt = computeLastClientMessageAt(messages);
    const sessionDeadline = computeSessionDeadline(lastClientMessageAt);
    const lastMessageAt = messages.length
      ? messages[messages.length - 1].createdAt
      : null;

    return NextResponse.json({
      case: {
        id: caseRow.id,
        caseIdentifier: identifiers[0] ?? rowId,
        customerName: caseRow.CustumerName ?? "Cliente",
        customerPhone: caseRow.CustumerPhone ?? "",
        paused: isCasePaused(caseRow),
        bjCaseId: caseRow.BJCaseId ?? null,
      },
      messages,
      meta: {
        total: messages.length,
        lastClientMessageAt,
        lastMessageAt,
        sessionDeadline,
        legacyFallbackUsed,
      },
    });
  } catch (error) {
    console.error("[chat] Falha ao listar mensagens do caso:", error);
    return NextResponse.json(
      {
        error: "server_error",
        message:
          error instanceof Error ? error.message : "Erro ao carregar mensagens",
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

    const quotedMessageIdRaw = formData.get("quotedMessageId");
    const quotedMessageId =
      typeof quotedMessageIdRaw === "string" && quotedMessageIdRaw
        ? Number(quotedMessageIdRaw)
        : null;

    // Get phone numbers for webhook
    // InstitutionID is a string in the cases table
    const rawInstitutionId = caseRow.InstitutionID ?? caseRow["body.auth.institutionId"];
    const institutionId = rawInstitutionId ? Number(String(rawInstitutionId).trim()) : undefined;
    const wabaPhoneNumber = await getWabaPhoneNumber(institutionId);
    const customerPhone = caseRow.CustumerPhone ? String(caseRow.CustumerPhone).trim() : "";

    const uploadedAttachments = await Promise.all(
      attachments.map((file) =>
        uploadAttachmentToBaserow(file, file.name || undefined),
      ),
    );

    const timestamp = new Date().toISOString();
    let newMessage: CaseMessage;
    let webhookDispatched = false;

    // Determine message type based on attachments
    const determineMessageType = (files: typeof uploadedAttachments): MessageType => {
      if (!files.length) return "text";
      const first = files[0];
      const mimeType = first.mime_type ?? "";
      if (mimeType.startsWith("audio/")) return "audio";
      if (mimeType.startsWith("image/") || first.is_image) return "image";
      if (mimeType.startsWith("video/")) return "video";
      return "document";
    };

    const messageType = determineMessageType(uploadedAttachments);

    // Extract imageId, audioid or documentId from uploaded files
    const getMediaId = (files: typeof uploadedAttachments, type: "image" | "audio" | "document"): string | undefined => {
      const file = files.find((f) => {
        const mimeType = f.mime_type ?? "";
        if (type === "image") return mimeType.startsWith("image/") || f.is_image;
        if (type === "audio") return mimeType.startsWith("audio/");
        if (type === "document") {
          return !mimeType.startsWith("image/") &&
                 !mimeType.startsWith("audio/") &&
                 !mimeType.startsWith("video/") &&
                 !f.is_image;
        }
        return false;
      });
      return file?.name ?? undefined;
    };

    // Only dispatch webhook if we have phone numbers and content/attachments
    if (wabaPhoneNumber && customerPhone && (content || uploadedAttachments.length)) {
      const now = new Date();
      const webhookPayload: ChatWebhookPayload = {
        display_phone_number: wabaPhoneNumber,
        to: customerPhone,
        text: content,
        DataHora: formatDateTimeBR(now),
        field: "chat",
        messages_type: messageType,
      };

      // Add imageId, audioid or documentId based on message type
      if (messageType === "image") {
        webhookPayload.imageId = getMediaId(uploadedAttachments, "image");
      } else if (messageType === "audio") {
        webhookPayload.audioid = getMediaId(uploadedAttachments, "audio");
      } else if (messageType === "document") {
        webhookPayload.documentId = getMediaId(uploadedAttachments, "document");
      }

      await dispatchChatWebhook(webhookPayload);
      webhookDispatched = true;

      // When webhook is dispatched, it creates the record in Baserow as "usuário"
      // We return a temporary message object - actual record comes from webhook
      newMessage = {
        id: Date.now(), // Temporary ID until next poll
        caseId: rowId,
        sender: "bot", // Webhook creates as "usuário" which normalizes to "bot"
        direction: "outbound",
        content,
        createdAt: timestamp,
        deliveryStatus: "sent",
        kind,
        attachments: uploadedAttachments.map((file) => ({
          id: String(file.id ?? file.name ?? Date.now()),
          name: file.original_name ?? file.name ?? "arquivo",
          mimeType: file.mime_type ?? "application/octet-stream",
          size: file.size ?? 0,
          url: file.url ?? "",
          isImage: file.is_image ?? false,
        })),
      };
    } else {
      // No webhook available - create record directly in Baserow
      const createdRow = await createCaseMessageRow({
        caseIdentifier: identifiers[0] ?? rowId,
        sender: "bot", // Use "bot" (usuário) instead of "agente"
        content,
        attachments: uploadedAttachments,
        timestamp,
        from: wabaPhoneNumber ?? undefined,
        to: customerPhone || undefined,
        messages_type: messageType,
        audioid: messageType === "audio" ? getMediaId(uploadedAttachments, "audio") : undefined,
        imageId: messageType === "image" ? getMediaId(uploadedAttachments, "image") : undefined,
        documentId: messageType === "document" ? getMediaId(uploadedAttachments, "document") : undefined,
      });

      newMessage = normalizeCaseMessageRow(createdRow, rowId, customerPhone);
    }

    const attachmentNames = uploadedAttachments
      .map((file) => file.original_name ?? file.name)
      .filter((name): name is string => Boolean(name));

    const conversationLine = formatConversationLine({
      sender,
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
        error: "server_error",
        message:
          error instanceof Error ? error.message : "Erro ao enviar mensagem",
      },
      { status: 500 },
    );
  }
}

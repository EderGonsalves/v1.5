export type CaseMessageSender = "cliente" | "agente" | "bot" | "sistema";

export type CaseMessageDirection = "inbound" | "outbound";

export type CaseMessageDelivery =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type CaseMessageKind = "text" | "media" | "audio" | "document" | "system";

export type CaseMessageAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  previewUrl?: string;
  isImage?: boolean;
  waveformUrl?: string;
  durationSeconds?: number;
};

export type CaseMessage = {
  id: number;
  caseId: number;
  sender: CaseMessageSender;
  direction: CaseMessageDirection;
  content: string;
  createdAt: string;
  deliveryStatus: CaseMessageDelivery;
  kind: CaseMessageKind;
  attachments: CaseMessageAttachment[];
  metadata?: Record<string, unknown>;
  messageType?: "text" | "image" | "audio" | "document" | "video";
  audioId?: string;
  imageId?: string;
  documentId?: string;
};

export type SendCaseMessagePayload = {
  content?: string;
  sender?: CaseMessageSender;
  kind?: CaseMessageKind;
  attachments?: File[];
  quotedMessageId?: number | null;
  metadata?: Record<string, unknown>;
  type?: "ghost";
  /** Número WABA específico para enviar a mensagem (quando instituição tem múltiplos números) */
  wabaPhoneNumber?: string;
};

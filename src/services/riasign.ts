/**
 * RIA Sign API Service — Electronic Signature
 * Server-only: uses RIASIGN_API_KEY env var
 * Pattern: follows src/services/codilo.ts
 */

import type {
  RiaSignEnvelope,
  RiaSignDocument,
  RiaSignSendResponse,
  RiaSignAuditTrail,
} from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RIASIGN_API_KEY = process.env.RIASIGN_API_KEY ?? "";
const RIASIGN_BASE_URL = (
  process.env.RIASIGN_BASE_URL ?? "https://sign.riasistemas.com.br"
).replace(/\/$/, "");
const RIASIGN_WEBHOOK_SECRET = process.env.RIASIGN_WEBHOOK_SECRET ?? "";

function jsonHeaders() {
  return {
    Authorization: `Bearer ${RIASIGN_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function authHeader() {
  return { Authorization: `Bearer ${RIASIGN_API_KEY}` };
}

function ensureApiKey() {
  if (!RIASIGN_API_KEY) throw new Error("RIASIGN_API_KEY não configurado");
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export async function createEnvelope(params: {
  subject: string;
  message?: string;
  webhookUrl: string;
  signers: Array<{
    name: string;
    email?: string;
    phone?: string;
    cpf?: string;
  }>;
  callbackUrl?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  waba_config_id?: string;
  use_template?: boolean;
  require_otp?: boolean;
  require_selfie?: boolean;
}): Promise<RiaSignEnvelope> {
  ensureApiKey();
  const payload = {
    subject: params.subject,
    message: params.message,
    webhookUrl: params.webhookUrl,
    signers: params.signers,
    callbackUrl: params.callbackUrl,
    expiresAt: params.expiresAt,
    metadata: params.metadata,
    ...(params.waba_config_id ? { waba_config_id: params.waba_config_id } : {}),
    use_template: params.use_template ?? false,
    require_otp: params.require_otp ?? false,
    require_selfie: params.require_selfie ?? false,
  };
  console.log("[riasign] createEnvelope payload:", JSON.stringify(payload, null, 2));
  const res = await fetch(`${RIASIGN_BASE_URL}/api/envelopes`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign createEnvelope falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as RiaSignEnvelope;
}

export async function getEnvelope(
  envelopeId: string,
): Promise<RiaSignEnvelope> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}`,
    { headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign getEnvelope falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as RiaSignEnvelope;
}

export async function listEnvelopes(
  limit = 50,
  offset = 0,
): Promise<{ envelopes: RiaSignEnvelope[]; count: number }> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes?limit=${limit}&offset=${offset}`,
    { headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign listEnvelopes falhou (${res.status}): ${text}`);
  }
  return res.json();
}

export async function deleteEnvelope(envelopeId: string): Promise<void> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}`,
    { method: "DELETE", headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `RIA Sign deleteEnvelope falhou (${res.status}): ${text}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(
  envelopeId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType = "application/pdf",
  previewBuffers?: Buffer[],
): Promise<RiaSignDocument> {
  ensureApiKey();
  const formData = new FormData();

  const toBlob = (buf: Buffer, type: string) => {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return new Blob([ab], { type });
  };

  formData.append("file", toBlob(fileBuffer, mimeType), filename);

  // Append PNG previews (preview_0, preview_1, preview_2)
  if (previewBuffers?.length) {
    for (let i = 0; i < Math.min(previewBuffers.length, 3); i++) {
      formData.append(`preview_${i}`, toBlob(previewBuffers[i], "image/png"), `preview_${i}.png`);
    }
  }

  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}/documents`,
    {
      method: "POST",
      headers: authHeader(), // no Content-Type — let fetch set multipart boundary
      body: formData,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `RIA Sign uploadDocument falhou (${res.status}): ${text}`,
    );
  }
  return (await res.json()) as RiaSignDocument;
}

export async function downloadOriginalPdf(
  envelopeId: string,
  docId: string,
): Promise<Buffer> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}/documents/${docId}/download`,
    { headers: authHeader() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `RIA Sign downloadOriginal falhou (${res.status}): ${text}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadSealedPdf(
  envelopeId: string,
): Promise<Buffer> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}/download`,
    { headers: authHeader() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `RIA Sign downloadSealed falhou (${res.status}): ${text}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendEnvelope(
  envelopeId: string,
): Promise<RiaSignSendResponse> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}/send`,
    { method: "POST", headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign sendEnvelope falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as RiaSignSendResponse;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export async function getAuditTrail(
  envelopeId: string,
): Promise<RiaSignAuditTrail> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/envelopes/${envelopeId}/audit`,
    { headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign getAuditTrail falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as RiaSignAuditTrail;
}

// ---------------------------------------------------------------------------
// Webhook HMAC-SHA256 Validation
// ---------------------------------------------------------------------------

export async function validateRiaSignWebhook(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  // Se o secret não está configurado, aceitar sem validação (modo dev)
  if (!RIASIGN_WEBHOOK_SECRET) {
    console.warn(
      "[riasign] RIASIGN_WEBHOOK_SECRET não configurado — aceitando webhook sem HMAC",
    );
    return true;
  }

  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(RIASIGN_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // RIA Sign sends the hex digest directly
  return computed === signature;
}

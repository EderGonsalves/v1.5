/**
 * RIA Sign API Service — Electronic Signature
 * Server-only: uses RIASIGN_API_KEY env var
 * Pattern: follows src/services/codilo.ts
 */

import type {
  RiaSignEnvelope,
  RiaSignAuditTrail,
  RiaSignV2SendResponse,
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
// Envelopes (v2)
// ---------------------------------------------------------------------------

export async function getEnvelope(
  envelopeId: string,
): Promise<RiaSignEnvelope> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/v2/envelopes/${envelopeId}`,
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
  status?: "draft" | "sent" | "completed" | "cancelled",
): Promise<{ envelopes: RiaSignEnvelope[]; count: number }> {
  ensureApiKey();
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (status) params.set("status", status);
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/v2/envelopes?${params}`,
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
    `${RIASIGN_BASE_URL}/api/v2/envelopes/${envelopeId}`,
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
// Documents (v2)
// ---------------------------------------------------------------------------

export async function downloadSealedPdf(
  envelopeId: string,
): Promise<Buffer> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/v2/envelopes/${envelopeId}/pdf`,
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
// Send (v2 — POST /api/v2/send)
// ---------------------------------------------------------------------------

export async function sendV2(params: {
  pdfBuffer: Buffer;
  filename: string;
  subject: string;
  signers: Array<{
    name: string;
    phone: string;
    email?: string;
    cpf?: string;
    role?: string;
    order?: number;
  }>;
  message?: string;
  webhookUrl?: string;
  callbackUrl?: string;
  selfie?: boolean;
  idPhoto?: boolean;
  otp?: boolean;
  reminders?: boolean;
  expires?: string;
  metadata?: Record<string, unknown>;
  previewBuffers?: Buffer[];
}): Promise<RiaSignV2SendResponse> {
  ensureApiKey();

  const toBlob = (buf: Buffer, type: string) => {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return new Blob([ab], { type });
  };

  const formData = new FormData();
  formData.append("file", toBlob(params.pdfBuffer, "application/pdf"), params.filename);

  // Append PNG previews (preview_0, preview_1, preview_2)
  if (params.previewBuffers?.length) {
    for (let i = 0; i < Math.min(params.previewBuffers.length, 3); i++) {
      formData.append(`preview_${i}`, toBlob(params.previewBuffers[i], "image/png"), `preview_${i}.png`);
    }
  }

  const data: Record<string, unknown> = {
    subject: params.subject,
    signers: params.signers,
  };
  if (params.message) data.message = params.message;
  if (params.webhookUrl) data.webhookUrl = params.webhookUrl;
  if (params.callbackUrl) data.callbackUrl = params.callbackUrl;
  if (params.selfie) data.selfie = true;
  if (params.idPhoto) data.idPhoto = true;
  if (params.otp) data.otp = true;
  if (params.reminders) data.reminders = true;
  if (params.expires) data.expires = params.expires;
  if (params.metadata) data.metadata = params.metadata;

  formData.append("data", JSON.stringify(data));

  console.log("[riasign] sendV2 data:", JSON.stringify(data, null, 2));

  const res = await fetch(`${RIASIGN_BASE_URL}/api/v2/send`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign v2/send falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as RiaSignV2SendResponse;
}

// ---------------------------------------------------------------------------
// Remind (v2 — POST /api/v2/envelopes/:id/remind)
// ---------------------------------------------------------------------------

export async function remindEnvelope(
  envelopeId: string,
): Promise<{ reminded: Array<{ name: string; status: string; channel: string }> }> {
  ensureApiKey();
  const res = await fetch(
    `${RIASIGN_BASE_URL}/api/v2/envelopes/${envelopeId}/remind`,
    { method: "POST", headers: jsonHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RIA Sign remind falhou (${res.status}): ${text}`);
  }
  return res.json();
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

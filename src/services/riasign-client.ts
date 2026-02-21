/**
 * RIA Sign — Client-side fetch wrappers
 * Pattern: follows src/services/lawsuit-client.ts
 */

import type { SignEnvelopeRow } from "@/lib/documents/types";

export async function fetchEnvelopesByCaseId(
  caseId: number,
): Promise<SignEnvelopeRow[]> {
  const res = await fetch(`/api/v1/sign?caseId=${caseId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.envelopes ?? [];
}

export async function createSignEnvelope(body: {
  caseId: number;
  templateId: number;
  subject: string;
  htmlContent?: string;
  signers: Array<{ name: string; phone: string; email?: string }>;
  templateType?: string;
  waba_config_id?: string;
  require_otp?: boolean;
  require_selfie?: boolean;
}): Promise<SignEnvelopeRow> {
  const res = await fetch("/api/v1/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function refreshEnvelopeStatus(
  envelopeRowId: number,
): Promise<SignEnvelopeRow> {
  const res = await fetch(`/api/v1/sign/${envelopeRowId}`, {
    method: "PATCH",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function downloadSignedPdf(
  envelopeRowId: number,
): Promise<Blob> {
  const res = await fetch(`/api/v1/sign/${envelopeRowId}/download`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.blob();
}

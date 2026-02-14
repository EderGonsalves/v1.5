/**
 * Lawsuit Tracking — Client-side fetch wrappers
 */

import type { LawsuitTracking, LawsuitMovement } from "./lawsuit";

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export async function fetchTrackingByCaseId(
  caseId: number,
): Promise<LawsuitTracking[]> {
  const res = await fetch(`/api/v1/lawsuit?caseId=${caseId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.trackings ?? [];
}

export async function startMonitoring(
  caseId: number,
  cnj: string,
  institutionId: number,
): Promise<LawsuitTracking> {
  const res = await fetch("/api/v1/lawsuit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, cnj, institutionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function toggleTracking(
  trackingId: number,
  isActive: boolean,
): Promise<LawsuitTracking> {
  const res = await fetch(`/api/v1/lawsuit/${trackingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive ? "true" : "false" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function deleteTracking(trackingId: number): Promise<void> {
  const res = await fetch(`/api/v1/lawsuit/${trackingId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export async function fetchMovements(
  trackingId: number,
  opts?: { page?: number; size?: number },
): Promise<{ results: LawsuitMovement[]; count: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.size) params.set("size", String(opts.size));
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`/api/v1/lawsuit/${trackingId}/movements${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Consulta avulsa — sends query to Codilo, then polls OUR movements table
// ---------------------------------------------------------------------------

export async function queryLawsuit(
  trackingId: number,
): Promise<void> {
  const res = await fetch("/api/v1/lawsuit/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackingId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
}

/**
 * Query Codilo + poll our own movements for new results (max ~60s).
 * The Codilo autorequest is async — results arrive via webhook callback.
 * We poll our movements table to detect when the callback has been processed.
 */
export async function queryAndWait(
  trackingId: number,
  onProgress?: (status: string) => void,
): Promise<{ status: string; created?: number }> {
  // 1. Get current movement count before query
  const before = await fetchMovements(trackingId, { page: 1, size: 1 });
  const countBefore = before.count;

  // 2. Send the query to Codilo (fires async callback)
  await queryLawsuit(trackingId);
  onProgress?.("Consulta enviada. Aguardando resposta...");

  // 3. Poll our own movements table for new entries
  const MAX_ATTEMPTS = 12;
  const POLL_INTERVAL = 5000; // 5 seconds

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    onProgress?.(`Aguardando resultado... (${i + 1}/${MAX_ATTEMPTS})`);

    try {
      const after = await fetchMovements(trackingId, { page: 1, size: 1 });
      if (after.count > countBefore) {
        const created = after.count - countBefore;
        return { status: "completed", created };
      }
    } catch (err) {
      console.warn("[queryAndWait] Poll error:", err);
    }
  }

  return { status: "timeout" };
}

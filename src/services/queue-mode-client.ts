export type QueueMode = "round_robin" | "manual";

export type BulkAssignResult = {
  assigned: Array<{ caseId: number; userName: string }>;
  skipped: Array<{ caseId: number; reason: string }>;
  failed: Array<{ caseId: number; reason: string }>;
  total: number;
  successCount: number;
};

export async function fetchQueueMode(): Promise<QueueMode> {
  const res = await fetch("/api/v1/config/queue-mode");
  if (!res.ok) return "round_robin";
  const data = await res.json();
  return data.queueMode === "manual" ? "manual" : "round_robin";
}

export async function updateQueueMode(mode: QueueMode): Promise<void> {
  const res = await fetch("/api/v1/config/queue-mode", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queueMode: mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
}

export async function claimCase(caseId: number): Promise<{ success: boolean }> {
  const res = await fetch("/api/v1/cases/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function bulkAssignCases(
  caseIds: number[],
  targetUserId: number,
): Promise<BulkAssignResult> {
  const res = await fetch("/api/v1/cases/bulk-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseIds, targetUserId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

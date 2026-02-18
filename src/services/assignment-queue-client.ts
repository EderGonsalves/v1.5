export type QueueStats = {
  position: number;
  totalAssigned: number;
  lastAssignedAt: string | null;
  totalEligible: number;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error as string;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
};

export const fetchQueueStatsClient = async (
  userId: number,
  institutionId?: number,
): Promise<QueueStats> => {
  const params = new URLSearchParams({ userId: String(userId) });
  if (institutionId) params.set("institutionId", String(institutionId));
  return handleResponse<QueueStats>(
    await fetch(`/api/v1/assignment-queue/stats?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

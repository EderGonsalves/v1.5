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
): Promise<QueueStats> => {
  return handleResponse<QueueStats>(
    await fetch(`/api/v1/assignment-queue/stats?userId=${userId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

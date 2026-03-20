import type { TagPublicRow, CaseTagWithDetails } from "@/services/tags";

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
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
};

// ---------------------------------------------------------------------------
// Institution Tags
// ---------------------------------------------------------------------------

export const fetchTagsClient = async (
  institutionId?: number,
  category?: string,
): Promise<TagPublicRow[]> => {
  const params = new URLSearchParams();
  if (institutionId) params.set("institutionId", String(institutionId));
  if (category) params.set("category", category);
  const qs = params.toString();
  const data = await handleResponse<{ tags: TagPublicRow[] }>(
    await fetch(`/api/v1/tags${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.tags;
};

export const createTagClient = async (payload: {
  category: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  parentTagId?: number | null;
  aiCriteria?: string;
  institutionId?: number;
}): Promise<TagPublicRow> => {
  const data = await handleResponse<{ tag: TagPublicRow }>(
    await fetch("/api/v1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.tag;
};

export const updateTagClient = async (
  tagId: number,
  payload: {
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
    sortOrder?: number;
    aiCriteria?: string;
  },
): Promise<TagPublicRow> => {
  const data = await handleResponse<{ tag: TagPublicRow }>(
    await fetch(`/api/v1/tags/${tagId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.tag;
};

export const deleteTagClient = async (tagId: number): Promise<void> => {
  await handleResponse<Record<string, never>>(
    await fetch(`/api/v1/tags/${tagId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
  );
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export const seedTagsClient = async (
  institutionId?: number,
): Promise<{ created: number; existing: number }> => {
  return handleResponse<{ created: number; existing: number }>(
    await fetch("/api/v1/tags/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(institutionId ? { institutionId } : {}),
    }),
  );
};

// ---------------------------------------------------------------------------
// Case Tags
// ---------------------------------------------------------------------------

export const fetchCaseTagsClient = async (
  caseId: number,
): Promise<CaseTagWithDetails[]> => {
  const data = await handleResponse<{ tags: CaseTagWithDetails[] }>(
    await fetch(`/api/v1/tags/case/${caseId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return data.tags;
};

export const setCaseTagsClient = async (
  caseId: number,
  tagIds: number[],
): Promise<CaseTagWithDetails[]> => {
  const data = await handleResponse<{ tags: CaseTagWithDetails[] }>(
    await fetch(`/api/v1/tags/case/${caseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds }),
    }),
  );
  return data.tags;
};

export const fetchBatchCaseTagsClient = async (
  caseIds: number[],
): Promise<Record<number, CaseTagWithDetails[]>> => {
  const data = await handleResponse<{ caseTags: Record<number, CaseTagWithDetails[]> }>(
    await fetch("/api/v1/tags/cases/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds }),
    }),
  );
  return data.caseTags;
};

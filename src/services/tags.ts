import axios from "axios";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { institutionTags as tagTable } from "@/lib/db/schema/institutionTags";
import { caseTags as ctTable } from "@/lib/db/schema/caseTags";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { PREDEFINED_TAGS } from "@/lib/tags/predefined-tags";

// ---------------------------------------------------------------------------
// Baserow config (fallback)
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const INSTITUTION_FIELD = "institution_id";
const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const DEFAULT_TABLES = {
  institutionTags: 258,
  caseTags: 259,
};

const TABLE_IDS = {
  institutionTags:
    Number(
      process.env.BASEROW_INSTITUTION_TAGS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_INSTITUTION_TAGS_TABLE_ID ??
        DEFAULT_TABLES.institutionTags,
    ) || DEFAULT_TABLES.institutionTags,
  caseTags:
    Number(
      process.env.BASEROW_CASE_TAGS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_CASE_TAGS_TABLE_ID ??
        DEFAULT_TABLES.caseTags,
    ) || DEFAULT_TABLES.caseTags,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BaserowListResponse<T> = {
  results?: T[];
  next?: string | null;
};

export type BaserowTagRow = {
  id: number;
  institution_id?: number;
  category?: string;
  name?: string;
  description?: string;
  color?: string;
  is_active?: boolean | string;
  sort_order?: number;
  parent_tag_id?: number | null;
  ai_criteria?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type TagPublicRow = {
  id: number;
  institutionId: number;
  category: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  parentTagId: number | null;
  aiCriteria: string;
  createdAt: string;
  updatedAt: string;
};

export type BaserowCaseTagRow = {
  id: number;
  case_id?: number;
  tag_id?: number;
  institution_id?: number;
  assigned_by?: string;
  assigned_at?: string;
  confidence?: number | null;
  [key: string]: unknown;
};

export type CaseTagPublicRow = {
  id: number;
  caseId: number;
  tagId: number;
  institutionId: number;
  assignedBy: string;
  assignedAt: string;
  confidence: number | null;
};

export type CaseTagWithDetails = CaseTagPublicRow & {
  name: string;
  color: string;
  category: string;
};

// ---------------------------------------------------------------------------
// Baserow client utilities (fallback)
// ---------------------------------------------------------------------------

const ensureEnv = () => {
  if (!BASEROW_API_URL) throw new Error("BASEROW_API_URL não configurado");
  if (!BASEROW_API_KEY) throw new Error("BASEROW_API_KEY não configurado");
};

const baserowClient = () => {
  ensureEnv();
  return axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
};

const withInstitutionFilter = (
  params: URLSearchParams,
  institutionId: number,
) => {
  params.append(`filter__${INSTITUTION_FIELD}__equal`, String(institutionId));
};

const fetchTableRows = async <T>(
  tableId: number,
  params?: URLSearchParams,
): Promise<T[]> => {
  const client = baserowClient();
  const searchParams = params ?? new URLSearchParams();
  if (!searchParams.has("user_field_names")) {
    searchParams.set("user_field_names", "true");
  }
  searchParams.set("size", "200");
  const url = `/database/rows/table/${tableId}/?${searchParams.toString()}`;
  const response = await client.get<BaserowListResponse<T>>(url);
  return response.data.results ?? [];
};

const fetchAllTableRows = async <T>(
  tableId: number,
  params?: URLSearchParams,
): Promise<T[]> => {
  const client = baserowClient();
  const searchParams = params ?? new URLSearchParams();
  if (!searchParams.has("user_field_names")) {
    searchParams.set("user_field_names", "true");
  }
  searchParams.set("size", "200");
  let nextUrl: string | null = `/database/rows/table/${tableId}/?${searchParams.toString()}`;
  const all: T[] = [];
  while (nextUrl) {
    const resp: { data: BaserowListResponse<T> } = await client.get<BaserowListResponse<T>>(nextUrl);
    const pageData: BaserowListResponse<T> = resp.data;
    if (pageData.results) all.push(...pageData.results);
    nextUrl = pageData.next ?? null;
  }
  return all;
};

const createRow = async <T>(
  tableId: number,
  payload: Record<string, unknown>,
) => {
  const client = baserowClient();
  const url = `/database/rows/table/${tableId}/?user_field_names=true`;
  const response = await client.post<T>(url, payload);
  return response.data;
};

const deleteRow = async (tableId: number, rowId: number) => {
  const client = baserowClient();
  await client.delete(`/database/rows/table/${tableId}/${rowId}/`);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isActiveValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return lower !== "false" && lower !== "0" && lower !== "";
  }
  return value !== false && value !== 0 && value !== null && value !== undefined;
};

export const isGlobalAdmin = (institutionId: number) =>
  institutionId === GLOBAL_ADMIN_INSTITUTION_ID;

// ---------------------------------------------------------------------------
// Drizzle mappers
// ---------------------------------------------------------------------------

function mapTagRow(r: typeof tagTable.$inferSelect): TagPublicRow {
  return {
    id: r.id,
    institutionId: r.institutionId ? Number(r.institutionId) : 0,
    category: (r.category ?? "").trim(),
    name: (r.name ?? "").trim(),
    description: (r.description ?? "").trim(),
    color: (r.color ?? "#6B7280").trim(),
    isActive: r.isActive === true,
    sortOrder: r.sortOrder ? Number(r.sortOrder) : 0,
    parentTagId: r.parentTagId ? Number(r.parentTagId) : null,
    aiCriteria: (r.aiCriteria ?? "").trim(),
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  };
}

function mapCaseTagRow(r: typeof ctTable.$inferSelect): CaseTagPublicRow {
  return {
    id: r.id,
    caseId: r.caseId ? Number(r.caseId) : 0,
    tagId: r.tagId ? Number(r.tagId) : 0,
    institutionId: r.institutionId ? Number(r.institutionId) : 0,
    assignedBy: (r.assignedBy ?? "").trim(),
    assignedAt: r.assignedAt ?? "",
    confidence: r.confidence ? Number(r.confidence) : null,
  };
}

// Baserow transformers (fallback)
const toTagPublic = (row: BaserowTagRow): TagPublicRow => {
  const rawInstId = row[INSTITUTION_FIELD];
  const instId = typeof rawInstId === "number" ? rawInstId : Number(rawInstId);
  return {
    id: row.id,
    institutionId: Number.isFinite(instId) && instId > 0 ? instId : 0,
    category: (row.category ?? "").trim(),
    name: (row.name ?? "").trim(),
    description: (row.description ?? "").trim(),
    color: (row.color ?? "#6B7280").trim(),
    isActive: isActiveValue(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    parentTagId: row.parent_tag_id ? Number(row.parent_tag_id) : null,
    aiCriteria: (row.ai_criteria ?? "").trim(),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
};

const toCaseTagPublic = (row: BaserowCaseTagRow): CaseTagPublicRow => {
  return {
    id: row.id,
    caseId: Number(row.case_id) || 0,
    tagId: Number(row.tag_id) || 0,
    institutionId: Number(row[INSTITUTION_FIELD]) || 0,
    assignedBy: (row.assigned_by ?? "").trim(),
    assignedAt: row.assigned_at ?? "",
    confidence: row.confidence != null ? Number(row.confidence) : null,
  };
};

// ---------------------------------------------------------------------------
// Server-side cache
// ---------------------------------------------------------------------------

const tagCacheMap = new Map<number, { rows: TagPublicRow[]; ts: number }>();
const TAG_CACHE_TTL = 600_000; // 10 minutes

export const invalidateTagsCache = (institutionId?: number): void => {
  if (institutionId !== undefined) {
    tagCacheMap.delete(institutionId);
  } else {
    tagCacheMap.clear();
  }
};

// ---------------------------------------------------------------------------
// Institution Tags CRUD
// ---------------------------------------------------------------------------

export const fetchInstitutionTags = async (
  institutionId: number,
  category?: string,
): Promise<TagPublicRow[]> => {
  const cached = tagCacheMap.get(institutionId);
  if (cached && Date.now() - cached.ts < TAG_CACHE_TTL) {
    const rows = cached.rows;
    return category ? rows.filter((r) => r.category === category) : rows;
  }

  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      const rows = await db
        .select()
        .from(tagTable)
        .where(eq(tagTable.institutionId, String(institutionId)));
      return rows.map(mapTagRow);
    });
    if (_dr !== undefined) {
      tagCacheMap.set(institutionId, { rows: _dr, ts: Date.now() });
      return category ? _dr.filter((r) => r.category === category) : _dr;
    }
  }

  // Baserow fallback
  const params = new URLSearchParams();
  withInstitutionFilter(params, institutionId);
  const rows = await fetchAllTableRows<BaserowTagRow>(TABLE_IDS.institutionTags, params);
  const result = rows.map(toTagPublic);
  tagCacheMap.set(institutionId, { rows: result, ts: Date.now() });
  return category ? result.filter((r) => r.category === category) : result;
};

export const fetchAllTags = async (): Promise<TagPublicRow[]> => {
  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      const rows = await db.select().from(tagTable);
      return rows.map(mapTagRow);
    });
    if (_dr !== undefined) return _dr;
  }

  const rows = await fetchAllTableRows<BaserowTagRow>(TABLE_IDS.institutionTags);
  return rows.map(toTagPublic);
};

export const createInstitutionTag = async (
  institutionId: number,
  data: {
    category: string;
    name: string;
    description?: string;
    color?: string;
    sortOrder?: number;
    parentTagId?: number | null;
    aiCriteria?: string;
  },
): Promise<TagPublicRow> => {
  const now = new Date().toISOString();
  const normalizedName = data.name.trim();

  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      // Check duplicate
      const existing = await db
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(
          and(
            eq(tagTable.institutionId, String(institutionId)),
            eq(tagTable.name, normalizedName),
            eq(tagTable.category, data.category),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error("Já existe uma tag com este nome nesta categoria.");
      }

      const [created] = await db
        .insert(tagTable)
        .values({
          institutionId: String(institutionId),
          category: data.category,
          name: normalizedName,
          description: data.description?.trim() ?? "",
          color: data.color ?? "#6B7280",
          isActive: true,
          sortOrder: data.sortOrder != null ? String(data.sortOrder) : "0",
          parentTagId: data.parentTagId != null ? String(data.parentTagId) : null,
          aiCriteria: data.aiCriteria?.trim() ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapTagRow(created);
    });
    if (_dr !== undefined) {
      invalidateTagsCache(institutionId);
      return _dr;
    }
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__name__equal", normalizedName);
  checkParams.append("filter__category__equal", data.category);
  withInstitutionFilter(checkParams, institutionId);
  const existingRows = await fetchTableRows<BaserowTagRow>(TABLE_IDS.institutionTags, checkParams);
  if (existingRows.length > 0) {
    throw new Error("Já existe uma tag com este nome nesta categoria.");
  }

  const payload: Record<string, unknown> = {
    [INSTITUTION_FIELD]: institutionId,
    category: data.category,
    name: normalizedName,
    description: data.description?.trim() ?? "",
    color: data.color ?? "#6B7280",
    is_active: true,
    sort_order: data.sortOrder ?? 0,
    parent_tag_id: data.parentTagId ?? null,
    ai_criteria: data.aiCriteria?.trim() ?? "",
    created_at: now,
    updated_at: now,
  };
  const row = await createRow<BaserowTagRow>(TABLE_IDS.institutionTags, payload);
  invalidateTagsCache(institutionId);
  return toTagPublic(row);
};

export const updateInstitutionTag = async (
  institutionId: number,
  tagId: number,
  data: {
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
    sortOrder?: number;
    aiCriteria?: string;
  },
): Promise<TagPublicRow> => {
  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      const [exists] = await db
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(
          and(
            eq(tagTable.id, tagId),
            eq(tagTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (!exists) throw new Error("Tag não encontrada nesta instituição.");

      const setValues: Partial<typeof tagTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.name !== undefined) setValues.name = data.name.trim();
      if (data.description !== undefined) setValues.description = data.description.trim();
      if (data.color !== undefined) setValues.color = data.color;
      if (data.isActive !== undefined) setValues.isActive = data.isActive;
      if (data.sortOrder !== undefined) setValues.sortOrder = String(data.sortOrder);
      if (data.aiCriteria !== undefined) setValues.aiCriteria = data.aiCriteria.trim();

      const [updated] = await db
        .update(tagTable)
        .set(setValues)
        .where(eq(tagTable.id, tagId))
        .returning();
      return mapTagRow(updated);
    });
    if (_dr !== undefined) {
      invalidateTagsCache(institutionId);
      return _dr;
    }
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(tagId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowTagRow>(TABLE_IDS.institutionTags, checkParams);
  if (rows.length === 0) throw new Error("Tag não encontrada nesta instituição.");

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.description !== undefined) payload.description = data.description.trim();
  if (data.color !== undefined) payload.color = data.color;
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.sortOrder !== undefined) payload.sort_order = data.sortOrder;
  if (data.aiCriteria !== undefined) payload.ai_criteria = data.aiCriteria.trim();

  const client = baserowClient();
  const response = await client.patch<BaserowTagRow>(
    `/database/rows/table/${TABLE_IDS.institutionTags}/${tagId}/?user_field_names=true`,
    payload,
  );
  invalidateTagsCache(institutionId);
  return toTagPublic(response.data);
};

export const deleteInstitutionTag = async (
  institutionId: number,
  tagId: number,
): Promise<void> => {
  if (useDirectDb("tags")) {
    const _ok = await tryDrizzle("tags", async () => {
      const [exists] = await db
        .select({ id: tagTable.id, category: tagTable.category })
        .from(tagTable)
        .where(
          and(
            eq(tagTable.id, tagId),
            eq(tagTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (!exists) throw new Error("Tag não encontrada nesta instituição.");
      if (exists.category !== "custom") {
        throw new Error("Apenas tags customizadas podem ser excluídas. Desative a tag ao invés disso.");
      }

      // Delete case-tag associations
      await db.delete(ctTable).where(
        and(
          eq(ctTable.tagId, String(tagId)),
          eq(ctTable.institutionId, String(institutionId)),
        ),
      );

      await db.delete(tagTable).where(eq(tagTable.id, tagId));
    });
    if (_ok !== undefined) {
      invalidateTagsCache(institutionId);
      return;
    }
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__id__equal", String(tagId));
  withInstitutionFilter(checkParams, institutionId);
  const rows = await fetchTableRows<BaserowTagRow>(TABLE_IDS.institutionTags, checkParams);
  if (rows.length === 0) throw new Error("Tag não encontrada nesta instituição.");
  if (rows[0].category !== "custom") {
    throw new Error("Apenas tags customizadas podem ser excluídas. Desative a tag ao invés disso.");
  }

  // Delete case-tag associations
  const ctParams = new URLSearchParams();
  ctParams.append("filter__tag_id__equal", String(tagId));
  withInstitutionFilter(ctParams, institutionId);
  const caseTagRows = await fetchTableRows<BaserowCaseTagRow>(TABLE_IDS.caseTags, ctParams);
  for (const ct of caseTagRows) {
    await deleteRow(TABLE_IDS.caseTags, ct.id);
  }

  await deleteRow(TABLE_IDS.institutionTags, tagId);
  invalidateTagsCache(institutionId);
};

// ---------------------------------------------------------------------------
// Seed predefined tags
// ---------------------------------------------------------------------------

export const seedInstitutionTags = async (
  institutionId: number,
): Promise<{ created: number; existing: number }> => {
  const current = await fetchInstitutionTags(institutionId);
  const existingNames = new Map(
    current.map((t) => [`${t.category}:${t.name.toLowerCase().trim()}`, t]),
  );

  // Build parent name→id map for sub-area linkage
  const parentNameToId = new Map<string, number>();
  for (const t of current) {
    if (t.category === "area_direito") {
      parentNameToId.set(t.name.toLowerCase().trim(), t.id);
    }
  }

  let created = 0;

  // First pass: create non-sub-area tags (areas, urgencia, estagio, qualidade_lead)
  for (const tag of PREDEFINED_TAGS.filter((t) => t.category !== "sub_area")) {
    const key = `${tag.category}:${tag.name.toLowerCase().trim()}`;
    if (!existingNames.has(key)) {
      const row = await createInstitutionTag(institutionId, {
        category: tag.category,
        name: tag.name,
        color: tag.color,
        sortOrder: tag.sortOrder,
      });
      parentNameToId.set(tag.name.toLowerCase().trim(), row.id);
      created++;
    }
  }

  // Refresh cache after first pass to get parent IDs
  invalidateTagsCache(institutionId);

  // Second pass: create sub-areas with parent linkage
  for (const tag of PREDEFINED_TAGS.filter((t) => t.category === "sub_area")) {
    const key = `${tag.category}:${tag.name.toLowerCase().trim()}`;
    if (!existingNames.has(key)) {
      const parentId = tag.parentName
        ? parentNameToId.get(tag.parentName.toLowerCase().trim()) ?? null
        : null;
      await createInstitutionTag(institutionId, {
        category: tag.category,
        name: tag.name,
        color: tag.color,
        sortOrder: tag.sortOrder,
        parentTagId: parentId,
      });
      created++;
    }
  }

  invalidateTagsCache(institutionId);
  return { created, existing: current.length };
};

// ---------------------------------------------------------------------------
// Case Tags CRUD
// ---------------------------------------------------------------------------

export const fetchCaseTags = async (
  caseId: number,
  institutionId: number,
): Promise<CaseTagWithDetails[]> => {
  const allTags = await fetchInstitutionTags(institutionId);
  const tagMap = new Map(allTags.map((t) => [t.id, t]));

  let caseTagRows: CaseTagPublicRow[];

  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      const rows = await db
        .select()
        .from(ctTable)
        .where(
          and(
            eq(ctTable.caseId, String(caseId)),
            eq(ctTable.institutionId, String(institutionId)),
          ),
        );
      return rows.map(mapCaseTagRow);
    });
    if (_dr !== undefined) {
      caseTagRows = _dr;
    } else {
      caseTagRows = await fetchCaseTagsBaserow(caseId, institutionId);
    }
  } else {
    caseTagRows = await fetchCaseTagsBaserow(caseId, institutionId);
  }

  return caseTagRows
    .map((ct) => {
      const tag = tagMap.get(ct.tagId);
      if (!tag) return null;
      return {
        ...ct,
        name: tag.name,
        color: tag.color,
        category: tag.category,
      };
    })
    .filter(Boolean) as CaseTagWithDetails[];
};

const fetchCaseTagsBaserow = async (
  caseId: number,
  institutionId: number,
): Promise<CaseTagPublicRow[]> => {
  const params = new URLSearchParams();
  params.append("filter__case_id__equal", String(caseId));
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowCaseTagRow>(TABLE_IDS.caseTags, params);
  return rows.map(toCaseTagPublic);
};

export const assignTagToCase = async (
  caseId: number,
  tagId: number,
  institutionId: number,
  assignedBy: string,
  confidence?: number,
): Promise<CaseTagPublicRow> => {
  const now = new Date().toISOString();

  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      // Check if already assigned
      const [existing] = await db
        .select({ id: ctTable.id })
        .from(ctTable)
        .where(
          and(
            eq(ctTable.caseId, String(caseId)),
            eq(ctTable.tagId, String(tagId)),
            eq(ctTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      if (existing) return mapCaseTagRow({ ...existing, caseId: String(caseId) as any } as any);

      const [created] = await db
        .insert(ctTable)
        .values({
          caseId: String(caseId),
          tagId: String(tagId),
          institutionId: String(institutionId),
          assignedBy,
          assignedAt: now,
          confidence: confidence != null ? String(confidence) : null,
        })
        .returning();
      return mapCaseTagRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const checkParams = new URLSearchParams();
  checkParams.append("filter__case_id__equal", String(caseId));
  checkParams.append("filter__tag_id__equal", String(tagId));
  withInstitutionFilter(checkParams, institutionId);
  const existing = await fetchTableRows<BaserowCaseTagRow>(TABLE_IDS.caseTags, checkParams);
  if (existing.length > 0) return toCaseTagPublic(existing[0]);

  const row = await createRow<BaserowCaseTagRow>(TABLE_IDS.caseTags, {
    case_id: caseId,
    tag_id: tagId,
    [INSTITUTION_FIELD]: institutionId,
    assigned_by: assignedBy,
    assigned_at: now,
    confidence: confidence ?? null,
  });
  return toCaseTagPublic(row);
};

export const removeTagFromCase = async (
  caseId: number,
  tagId: number,
  institutionId: number,
): Promise<void> => {
  if (useDirectDb("tags")) {
    const _ok = await tryDrizzle("tags", async () => {
      await db.delete(ctTable).where(
        and(
          eq(ctTable.caseId, String(caseId)),
          eq(ctTable.tagId, String(tagId)),
          eq(ctTable.institutionId, String(institutionId)),
        ),
      );
    });
    if (_ok !== undefined) return;
  }

  // Baserow fallback
  const params = new URLSearchParams();
  params.append("filter__case_id__equal", String(caseId));
  params.append("filter__tag_id__equal", String(tagId));
  withInstitutionFilter(params, institutionId);
  const rows = await fetchTableRows<BaserowCaseTagRow>(TABLE_IDS.caseTags, params);
  for (const row of rows) {
    await deleteRow(TABLE_IDS.caseTags, row.id);
  }
};

export const setCaseTags = async (
  caseId: number,
  institutionId: number,
  tagIds: number[],
  assignedBy: string,
): Promise<CaseTagWithDetails[]> => {
  // Get current tags
  const currentCaseTags = await fetchCaseTags(caseId, institutionId);
  const currentTagIds = new Set(currentCaseTags.map((ct) => ct.tagId));
  const targetTagIds = new Set(tagIds);

  // Remove tags not in target
  for (const ct of currentCaseTags) {
    if (!targetTagIds.has(ct.tagId)) {
      await removeTagFromCase(caseId, ct.tagId, institutionId);
    }
  }

  // Add new tags
  for (const tagId of tagIds) {
    if (!currentTagIds.has(tagId)) {
      await assignTagToCase(caseId, tagId, institutionId, assignedBy);
    }
  }

  return fetchCaseTags(caseId, institutionId);
};

export const fetchBatchCaseTags = async (
  caseIds: number[],
  institutionId: number,
): Promise<Record<number, CaseTagWithDetails[]>> => {
  if (caseIds.length === 0) return {};

  const allTags = await fetchInstitutionTags(institutionId);
  const tagMap = new Map(allTags.map((t) => [t.id, t]));

  let allCaseTagRows: CaseTagPublicRow[] = [];

  if (useDirectDb("tags")) {
    const _dr = await tryDrizzle("tags", async () => {
      const rows = await db
        .select()
        .from(ctTable)
        .where(eq(ctTable.institutionId, String(institutionId)));
      return rows.map(mapCaseTagRow);
    });
    if (_dr !== undefined) {
      allCaseTagRows = _dr;
    }
  }

  if (allCaseTagRows.length === 0) {
    // Baserow fallback — fetch all case tags for this institution
    const params = new URLSearchParams();
    withInstitutionFilter(params, institutionId);
    const rows = await fetchAllTableRows<BaserowCaseTagRow>(TABLE_IDS.caseTags, params);
    allCaseTagRows = rows.map(toCaseTagPublic);
  }

  // Filter to requested caseIds and build map
  const caseIdSet = new Set(caseIds);
  const result: Record<number, CaseTagWithDetails[]> = {};

  for (const caseId of caseIds) {
    result[caseId] = [];
  }

  for (const ct of allCaseTagRows) {
    if (!caseIdSet.has(ct.caseId)) continue;
    const tag = tagMap.get(ct.tagId);
    if (!tag) continue;
    if (!result[ct.caseId]) result[ct.caseId] = [];
    result[ct.caseId].push({
      ...ct,
      name: tag.name,
      color: tag.color,
      category: tag.category,
    });
  }

  return result;
};

// ---------------------------------------------------------------------------
// Bulk assign (for AI agent — Fase 4)
// ---------------------------------------------------------------------------

export const bulkAssignTags = async (
  caseIds: number[],
  tagIds: number[],
  institutionId: number,
  assignedBy: string,
  confidence?: number,
): Promise<number> => {
  let count = 0;
  for (const caseId of caseIds) {
    for (const tagId of tagIds) {
      await assignTagToCase(caseId, tagId, institutionId, assignedBy, confidence);
      count++;
    }
  }
  return count;
};

// ---------------------------------------------------------------------------
// AI Criteria (Fase 4)
// ---------------------------------------------------------------------------

export const fetchTagsWithCriteria = async (
  institutionId: number,
): Promise<TagPublicRow[]> => {
  const allTags = await fetchInstitutionTags(institutionId);
  return allTags.filter((t) => t.isActive && t.aiCriteria.length > 0);
};

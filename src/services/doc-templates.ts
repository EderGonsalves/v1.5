/**
 * Document Templates Service — CRUD for Baserow table 257 + filesystem
 * Server-only. Supports Drizzle ORM (direct DB) with Baserow REST API fallback.
 * Feature flag domain: "docs"
 */

import path from "node:path";
import fs from "node:fs/promises";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { documentTemplates } from "@/lib/db/schema/documentTemplates";
import { baserowGet, baserowPost, baserowPatch } from "./api";
import type { DocumentTemplateRow } from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const TABLE_ID = process.env.BASEROW_DOCUMENT_TEMPLATES_TABLE_ID ?? "257";
const STORAGE_DIR =
  process.env.TEMPLATES_STORAGE_DIR ?? "/app/data/doc-templates";

/** Baserow field_id for the category single_select column */
const CATEGORY_FIELD_ID = 1992;

const tableUrl = () =>
  `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/?user_field_names=true`;

type BaserowListResponse<T> = {
  count: number;
  next: string | null;
  results: T[];
};

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function saveTemplateHtml(
  templateId: number,
  institutionId: number,
  html: string,
): Promise<string> {
  await ensureStorageDir();
  const filename = `template_${institutionId}_${templateId}.html`;
  const filePath = path.join(STORAGE_DIR, filename);
  await fs.writeFile(filePath, html, "utf8");
  return filename;
}

export async function readTemplateHtml(filePath: string): Promise<string> {
  const fullPath = path.join(STORAGE_DIR, filePath);
  return fs.readFile(fullPath, "utf8");
}

export async function saveTemplateFile(
  templateId: number,
  institutionId: number,
  fileBuffer: Buffer,
  extension: string,
): Promise<string> {
  await ensureStorageDir();
  const filename = `template_${institutionId}_${templateId}.${extension}`;
  const filePath = path.join(STORAGE_DIR, filename);
  await fs.writeFile(filePath, fileBuffer);
  return filename;
}

export async function readTemplateFile(filePath: string): Promise<Buffer> {
  const fullPath = path.join(STORAGE_DIR, filePath);
  return fs.readFile(fullPath);
}

async function deleteTemplateFile(filePath: string): Promise<void> {
  const fullPath = path.join(STORAGE_DIR, filePath);
  await fs.unlink(fullPath).catch(() => {});
}

// ---------------------------------------------------------------------------
// Drizzle: single_select helpers (same pattern as sign-envelopes.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve a single_select integer ID to its string value via
 * Baserow's internal `database_selectoption` table.
 */
async function resolveSelectOptionValue(
  optionId: number | null,
): Promise<string> {
  if (!optionId) return "";
  const result = await db.execute(
    sql`SELECT value FROM database_selectoption WHERE id = ${optionId} LIMIT 1`,
  );
  const row = result.rows[0] as { value: string } | undefined;
  return row?.value ?? "";
}

/**
 * Resolve a single_select string value to its integer ID for writes.
 */
async function resolveSelectOptionId(
  fieldId: number,
  value: string,
): Promise<number | null> {
  if (!value) return null;
  const result = await db.execute(
    sql`SELECT id FROM database_selectoption WHERE field_id = ${fieldId} AND value = ${value} LIMIT 1`,
  );
  const row = result.rows[0] as { id: number } | undefined;
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Drizzle row → DocumentTemplateRow mapper
// ---------------------------------------------------------------------------

/** Map a single Drizzle row → DocumentTemplateRow (snake_case for API compat) */
function mapRow(
  r: typeof documentTemplates.$inferSelect,
  categoryValue: string,
): DocumentTemplateRow {
  return {
    id: r.id,
    name: r.name || "",
    description: r.description || "",
    category: categoryValue,
    institution_id: Number(r.institutionId) || 0,
    created_by_user_id: Number(r.createdByUserId) || 0,
    file_path: r.filePath || "",
    variables: r.variables || "[]",
    is_active: r.isActive ? "true" : "false",
    created_at: r.createdAt || "",
    updated_at: r.updatedAt || "",
    template_type: r.templateType || "html",
    original_filename: r.originalFilename || "",
  };
}

/**
 * Map an array of Drizzle rows, resolving their category IDs in batch.
 */
async function mapRows(
  rows: (typeof documentTemplates.$inferSelect)[],
): Promise<DocumentTemplateRow[]> {
  if (rows.length === 0) return [];

  // Collect unique category IDs
  const catIds = [
    ...new Set(rows.map((r) => r.category).filter(Boolean)),
  ] as number[];

  // Batch resolve
  const catMap = new Map<number, string>();
  if (catIds.length > 0) {
    const result = await db.execute(
      sql`SELECT id, value FROM database_selectoption WHERE id IN ${sql.raw(`(${catIds.join(",")})`)}`
    );
    for (const opt of result.rows as { id: number; value: string }[]) {
      catMap.set(opt.id, opt.value);
    }
  }

  return rows.map((row) =>
    mapRow(row, row.category ? (catMap.get(row.category) ?? "") : ""),
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listTemplates(
  institutionId: number,
): Promise<DocumentTemplateRow[]> {
  if (useDirectDb("docs")) {
    const _dr = await tryDrizzle("docs", async () => {
      const conditions = [eq(documentTemplates.isActive, true)];
      if (institutionId !== 4) {
        conditions.push(
          eq(documentTemplates.institutionId, String(institutionId)),
        );
      }
      const rows = await db
        .select()
        .from(documentTemplates)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions));
      return mapRows(rows);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  let url = `${tableUrl()}&filter__is_active__equal=true`;
  if (institutionId !== 4) {
    url += `&filter__institution_id__equal=${institutionId}`;
  }
  const resp = await baserowGet<BaserowListResponse<DocumentTemplateRow>>(url);
  return resp.data.results ?? [];
}

export async function getTemplateById(
  id: number,
): Promise<DocumentTemplateRow | null> {
  if (useDirectDb("docs")) {
    const _dr = await tryDrizzle("docs", async () => {
      const [row] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, id))
        .limit(1);
      if (!row) return null;
      const categoryValue = await resolveSelectOptionValue(row.category);
      return mapRow(row, categoryValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
    const resp = await baserowGet<DocumentTemplateRow>(url);
    return resp.data;
  } catch {
    return null;
  }
}

export async function createTemplate(params: {
  name: string;
  description: string;
  category: string;
  institutionId: number;
  createdByUserId: number;
  htmlContent: string;
  variables: string[];
  templateType?: string;
  originalFilename?: string;
}): Promise<DocumentTemplateRow> {
  const now = new Date().toISOString();

  if (useDirectDb("docs")) {
    const _dr = await tryDrizzle("docs", async () => {
      // Resolve category string → integer option ID
      const categoryOptionId = await resolveSelectOptionId(
        CATEGORY_FIELD_ID,
        params.category,
      );
  
      // Insert row first to get the ID
      const [created] = await db
        .insert(documentTemplates)
        .values({
          name: params.name,
          description: params.description,
          category: categoryOptionId,
          institutionId: String(params.institutionId),
          createdByUserId: String(params.createdByUserId),
          filePath: "", // updated after file save
          variables: JSON.stringify(params.variables),
          isActive: true,
          templateType: params.templateType ?? "html",
          originalFilename: params.originalFilename ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
  
      // Save HTML file using the row ID
      const filePath = await saveTemplateHtml(
        created.id,
        params.institutionId,
        params.htmlContent,
      );
  
      // Update the row with the file path
      const [updated] = await db
        .update(documentTemplates)
        .set({ filePath })
        .where(eq(documentTemplates.id, created.id))
        .returning();
  
      const categoryValue = await resolveSelectOptionValue(updated.category);
      return mapRow(updated, categoryValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  // Create Baserow row first to get the ID
  const row = await baserowPost<DocumentTemplateRow>(tableUrl(), {
    name: params.name,
    description: params.description,
    category: params.category,
    institution_id: params.institutionId,
    created_by_user_id: params.createdByUserId,
    file_path: "", // updated after file save
    variables: JSON.stringify(params.variables),
    is_active: "true",
    template_type: params.templateType ?? "html",
    original_filename: params.originalFilename ?? "",
    created_at: now,
    updated_at: now,
  });

  // Save HTML file using the row ID
  const filePath = await saveTemplateHtml(
    row.data.id,
    params.institutionId,
    params.htmlContent,
  );

  // Update the row with the file path
  const updateUrl = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${row.data.id}/?user_field_names=true`;
  const updated = await baserowPatch<DocumentTemplateRow>(updateUrl, {
    file_path: filePath,
  });
  return updated.data;
}

export async function createDirectTemplate(params: {
  name: string;
  description: string;
  category: string;
  institutionId: number;
  createdByUserId: number;
  fileBuffer: Buffer;
  extension: string; // "pdf" or "docx"
  originalFilename: string;
}): Promise<DocumentTemplateRow> {
  const now = new Date().toISOString();
  const templateType = params.extension === "pdf" ? "direct_pdf" : "direct_docx";

  if (useDirectDb("docs")) {
    const _dr = await tryDrizzle("docs", async () => {
      // Resolve category string → integer option ID
      const categoryOptionId = await resolveSelectOptionId(
        CATEGORY_FIELD_ID,
        params.category,
      );
  
      const [created] = await db
        .insert(documentTemplates)
        .values({
          name: params.name,
          description: params.description,
          category: categoryOptionId,
          institutionId: String(params.institutionId),
          createdByUserId: String(params.createdByUserId),
          filePath: "",
          variables: "[]",
          isActive: true,
          templateType,
          originalFilename: params.originalFilename,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
  
      const filePath = await saveTemplateFile(
        created.id,
        params.institutionId,
        params.fileBuffer,
        params.extension,
      );
  
      const [updated] = await db
        .update(documentTemplates)
        .set({ filePath })
        .where(eq(documentTemplates.id, created.id))
        .returning();
  
      const categoryValue = await resolveSelectOptionValue(updated.category);
      return mapRow(updated, categoryValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const row = await baserowPost<DocumentTemplateRow>(tableUrl(), {
    name: params.name,
    description: params.description,
    category: params.category,
    institution_id: params.institutionId,
    created_by_user_id: params.createdByUserId,
    file_path: "",
    variables: "[]",
    is_active: "true",
    template_type: templateType,
    original_filename: params.originalFilename,
    created_at: now,
    updated_at: now,
  });

  const filePath = await saveTemplateFile(
    row.data.id,
    params.institutionId,
    params.fileBuffer,
    params.extension,
  );

  const updateUrl = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${row.data.id}/?user_field_names=true`;
  const updated = await baserowPatch<DocumentTemplateRow>(updateUrl, {
    file_path: filePath,
  });
  return updated.data;
}

export async function updateTemplate(
  id: number,
  params: {
    name?: string;
    description?: string;
    category?: string;
    htmlContent?: string;
    variables?: string[];
  },
  institutionId: number,
): Promise<DocumentTemplateRow> {
  if (useDirectDb("docs")) {
    const _dr = await tryDrizzle("docs", async () => {
      // Verify template exists
      const [existing] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, id))
        .limit(1);
      if (!existing) throw new Error("Template não encontrado");
  
      // Build the set object
      const setObj: Partial<typeof documentTemplates.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (params.name) setObj.name = params.name;
      if (params.description !== undefined)
        setObj.description = params.description;
      if (params.variables)
        setObj.variables = JSON.stringify(params.variables);
  
      // Handle category single_select: resolve string → option ID
      if (params.category) {
        const categoryOptionId = await resolveSelectOptionId(
          CATEGORY_FIELD_ID,
          params.category,
        );
        setObj.category = categoryOptionId;
      }
  
      if (params.htmlContent) {
        const filePath = await saveTemplateHtml(
          id,
          institutionId,
          params.htmlContent,
        );
        setObj.filePath = filePath;
      }
  
      const [updated] = await db
        .update(documentTemplates)
        .set(setObj)
        .where(eq(documentTemplates.id, id))
        .returning();
  
      const categoryValue = await resolveSelectOptionValue(updated.category);
      return mapRow(updated, categoryValue);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  const existing = await getTemplateById(id);
  if (!existing) throw new Error("Template não encontrado");

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.name) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.category) updates.category = params.category;
  if (params.variables) updates.variables = JSON.stringify(params.variables);

  if (params.htmlContent) {
    const filePath = await saveTemplateHtml(
      id,
      institutionId,
      params.htmlContent,
    );
    updates.file_path = filePath;
  }

  const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
  const resp = await baserowPatch<DocumentTemplateRow>(url, updates);
  return resp.data;
}

export async function softDeleteTemplate(id: number): Promise<void> {
  if (useDirectDb("docs")) {
    const _ok = await tryDrizzle("docs", async () => {
      const [existing] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, id))
        .limit(1);
      if (!existing) throw new Error("Template não encontrado");
  
      await db
        .update(documentTemplates)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documentTemplates.id, id));
  
      // Also delete the file
      if (existing.filePath) {
        await deleteTemplateFile(existing.filePath);
      }
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  const existing = await getTemplateById(id);
  if (!existing) throw new Error("Template não encontrado");

  const url = `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
  await baserowPatch(url, {
    is_active: "false",
    updated_at: new Date().toISOString(),
  });

  // Also delete the file
  if (existing.file_path) {
    await deleteTemplateFile(existing.file_path);
  }
}

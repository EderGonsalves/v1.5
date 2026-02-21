/**
 * Document Templates Service — CRUD for Baserow table 257 + filesystem
 * Server-only. Pattern: follows src/services/lawsuit.ts
 */

import path from "node:path";
import fs from "node:fs/promises";
import { baserowGet, baserowPost, baserowPatch } from "./api";
import type { DocumentTemplateRow } from "@/lib/documents/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const TABLE_ID = process.env.BASEROW_DOCUMENT_TEMPLATES_TABLE_ID ?? "257";
const STORAGE_DIR =
  process.env.TEMPLATES_STORAGE_DIR ?? "/app/data/doc-templates";

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
// Baserow CRUD
// ---------------------------------------------------------------------------

export async function listTemplates(
  institutionId: number,
): Promise<DocumentTemplateRow[]> {
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

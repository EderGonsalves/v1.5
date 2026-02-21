/**
 * Document Templates — Client-side fetch wrappers
 * Pattern: follows src/services/lawsuit-client.ts
 */

import type { DocumentTemplateRow } from "@/lib/documents/types";

export async function fetchTemplates(): Promise<DocumentTemplateRow[]> {
  const res = await fetch("/api/v1/doc-templates");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.templates ?? [];
}

export async function fetchTemplateWithContent(
  templateId: number,
): Promise<{ template: DocumentTemplateRow; htmlContent: string }> {
  const res = await fetch(`/api/v1/doc-templates/${templateId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function createDocumentTemplate(data: {
  name: string;
  description: string;
  category: string;
  html_content: string;
}): Promise<DocumentTemplateRow> {
  const res = await fetch("/api/v1/doc-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function updateDocumentTemplate(
  templateId: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    html_content?: string;
  },
): Promise<DocumentTemplateRow> {
  const res = await fetch(`/api/v1/doc-templates/${templateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Surface Zod validation issues for debugging
    let msg = err.error || `Erro ${res.status}`;
    if (err.issues?.length) {
      const details = err.issues.map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join("; ");
      msg += ` (${details})`;
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteDocumentTemplate(
  templateId: number,
): Promise<void> {
  const res = await fetch(`/api/v1/doc-templates/${templateId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
}

export async function convertDocxFile(
  file: File,
): Promise<{ html: string; warnings: string[]; variables: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/v1/doc-templates/convert-docx", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function uploadDocumentTemplate(params: {
  file: File;
  name: string;
  description: string;
  category: string;
  mode: "editable" | "direct";
}): Promise<{
  template: DocumentTemplateRow;
  htmlContent?: string;
  warnings?: string[];
}> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("name", params.name);
  formData.append("description", params.description);
  formData.append("category", params.category);
  formData.append("mode", params.mode);
  const res = await fetch("/api/v1/doc-templates/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

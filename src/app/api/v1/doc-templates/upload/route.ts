import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { uploadTemplateSchema } from "@/lib/documents/schemas";
import { extractVariables } from "@/lib/documents/variables";
import { convertDocxToHtml } from "@/services/docx-converter";
import {
  createTemplate,
  createDirectTemplate,
} from "@/services/doc-templates";

// POST /api/v1/doc-templates/upload — upload DOCX (editable) or PDF/DOCX (direct)
export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo obrigatório" },
        { status: 400 },
      );
    }

    const parsed = uploadTemplateSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      category: formData.get("category"),
      mode: formData.get("mode"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { name, description, category, mode } = parsed.data;
    const buffer = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    if (mode === "editable") {
      // DOCX → HTML conversion → editable template
      if (
        !lowerName.endsWith(".docx") &&
        file.type !==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        return NextResponse.json(
          { error: "Modo editável aceita apenas .docx" },
          { status: 400 },
        );
      }

      const { html, warnings } = await convertDocxToHtml(buffer);
      const variables = extractVariables(html);

      const template = await createTemplate({
        name,
        description: description ?? "",
        category,
        institutionId: auth.institutionId,
        createdByUserId: Number(auth.legacyUserId) || 0,
        htmlContent: html,
        variables,
        templateType: "html",
        originalFilename: file.name,
      });

      return NextResponse.json({ template, htmlContent: html, warnings }, { status: 201 });
    }

    // Direct upload (PDF or DOCX) — store as-is
    const extension = lowerName.endsWith(".pdf")
      ? "pdf"
      : lowerName.endsWith(".docx")
        ? "docx"
        : null;

    if (!extension) {
      return NextResponse.json(
        { error: "Upload direto aceita apenas .pdf ou .docx" },
        { status: 400 },
      );
    }

    const template = await createDirectTemplate({
      name,
      description: description ?? "",
      category,
      institutionId: auth.institutionId,
      createdByUserId: Number(auth.legacyUserId) || 0,
      fileBuffer: buffer,
      extension,
      originalFilename: file.name,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error("[doc-templates] upload error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao processar upload",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { updateTemplateSchema } from "@/lib/documents/schemas";
import { extractVariables } from "@/lib/documents/variables";
import {
  getTemplateById,
  readTemplateHtml,
  updateTemplate,
  softDeleteTemplate,
} from "@/services/doc-templates";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

// GET /api/v1/doc-templates/[templateId] — get template with HTML content
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { templateId } = await context.params;
  const id = Number(templateId);
  if (!id)
    return NextResponse.json(
      { error: "ID inválido" },
      { status: 400 },
    );

  try {
    const template = await getTemplateById(id);
    if (!template)
      return NextResponse.json(
        { error: "Template não encontrado" },
        { status: 404 },
      );

    // Check institution access (SysAdmin=4 sees all)
    if (
      auth.institutionId !== 4 &&
      template.institution_id !== auth.institutionId
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Direct upload templates have no editable HTML
    const templateType = template.template_type || "html";
    let htmlContent: string | null = null;

    if (templateType === "html" && template.file_path) {
      try {
        htmlContent = await readTemplateHtml(template.file_path);
      } catch {
        htmlContent = "";
      }
    }

    return NextResponse.json({ template, htmlContent });
  } catch (err) {
    console.error("[doc-templates] GET/:id error:", err);
    return NextResponse.json(
      { error: "Erro ao buscar template" },
      { status: 500 },
    );
  }
}

// PATCH /api/v1/doc-templates/[templateId] — update template
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { templateId } = await context.params;
  const id = Number(templateId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const body = await request.json();
    // Normalizar category se vier como objeto Baserow (single select)
    if (body.category && typeof body.category === "object" && body.category.value) {
      body.category = body.category.value;
    }
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const variables = parsed.data.html_content
      ? extractVariables(parsed.data.html_content)
      : undefined;

    const updated = await updateTemplate(
      id,
      {
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        htmlContent: parsed.data.html_content,
        variables,
      },
      auth.institutionId,
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[doc-templates] PATCH error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao atualizar template",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/v1/doc-templates/[templateId] — soft delete
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { templateId } = await context.params;
  const id = Number(templateId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    await softDeleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[doc-templates] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir" },
      { status: 500 },
    );
  }
}

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

    // Permitir acesso se: SysAdmin (4), mesma instituição, ou registro sem institution_id (legado)
    const tplInstId = Number(template.institution_id) || 0;
    if (
      auth.institutionId !== 4 &&
      tplInstId !== 0 &&
      tplInstId !== auth.institutionId
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Direct upload templates have no editable HTML
    const templateType = template.template_type || "html";
    let htmlContent: string | null = null;
    let warning: string | undefined;

    console.log(
      `[doc-templates] GET/${id} — type=${templateType}, file_path=${template.file_path || "(vazio)"}, institution_id=${template.institution_id}`,
    );

    if (templateType === "html") {
      if (!template.file_path) {
        console.warn(
          `[doc-templates] Template ${id} é HTML mas file_path está vazio/null`,
        );
        warning = "Template sem arquivo HTML associado (file_path vazio)";
        htmlContent = "";
      } else {
        try {
          htmlContent = await readTemplateHtml(template.file_path);
        } catch (readErr) {
          const errMsg = readErr instanceof Error ? readErr.message : String(readErr);
          console.error(
            `[doc-templates] Falha ao ler HTML do template ${id} (file_path=${template.file_path}):`,
            errMsg,
          );
          warning = `Arquivo do template não encontrado: ${errMsg}`;
          htmlContent = "";
        }
      }
    }

    return NextResponse.json({ template, htmlContent, warning });
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

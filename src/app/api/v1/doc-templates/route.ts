import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { createTemplateSchema } from "@/lib/documents/schemas";
import { extractVariables } from "@/lib/documents/variables";
import { listTemplates, createTemplate } from "@/services/doc-templates";

// GET /api/v1/doc-templates — list templates
export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const templates = await listTemplates(auth.institutionId);
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[doc-templates] GET error:", err);
    return NextResponse.json(
      { error: "Erro ao listar templates" },
      { status: 500 },
    );
  }
}

// POST /api/v1/doc-templates — create template
export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const variables = extractVariables(parsed.data.html_content);

    const template = await createTemplate({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      category: parsed.data.category,
      institutionId: auth.institutionId,
      createdByUserId: Number(auth.legacyUserId) || 0,
      htmlContent: parsed.data.html_content,
      variables,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error("[doc-templates] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar template" },
      { status: 500 },
    );
  }
}

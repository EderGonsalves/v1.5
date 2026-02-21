import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { convertDocxToHtml } from "@/services/docx-converter";
import { extractVariables } from "@/lib/documents/variables";

// POST /api/v1/doc-templates/convert-docx — convert DOCX to HTML (no save, preview only)
export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo .docx obrigatório" },
        { status: 400 },
      );
    }

    if (
      !file.name.toLowerCase().endsWith(".docx") &&
      file.type !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return NextResponse.json(
        { error: "Apenas arquivos .docx são aceitos" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { html, warnings } = await convertDocxToHtml(buffer);
    const variables = extractVariables(html);

    return NextResponse.json({ html, warnings, variables });
  } catch (err) {
    console.error("[doc-templates] convert-docx error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao converter DOCX",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getTemplateById, readTemplateHtml, readTemplateFile } from "@/services/doc-templates";
import { interpolateVariables } from "@/lib/documents/variables";
import { generatePdf } from "@/services/pdf-generator";
import { convertDocxToHtml } from "@/services/docx-converter";
import type { DocumentVariableContext } from "@/lib/documents/types";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

// POST /api/v1/doc-templates/[templateId]/preview — generate PDF preview
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { templateId } = await context.params;
  const id = Number(templateId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const body = await request.json();

    const template = await getTemplateById(id);
    if (!template)
      return NextResponse.json(
        { error: "Template não encontrado" },
        { status: 404 },
      );

    const templateType = template.template_type || "html";

    // Direct PDF: return stored file directly
    if (templateType === "direct_pdf") {
      const pdfBuffer = await readTemplateFile(template.file_path);
      return new NextResponse(
        pdfBuffer.buffer.slice(
          pdfBuffer.byteOffset,
          pdfBuffer.byteOffset + pdfBuffer.byteLength,
        ) as ArrayBuffer,
        {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="preview.pdf"',
            "Content-Length": String(pdfBuffer.length),
          },
        },
      );
    }

    // Direct DOCX: convert to HTML then to PDF
    if (templateType === "direct_docx") {
      const docxBuffer = await readTemplateFile(template.file_path);
      const { html } = await convertDocxToHtml(docxBuffer);
      const pdfBuffer = await generatePdf(html);
      return new NextResponse(
        pdfBuffer.buffer.slice(
          pdfBuffer.byteOffset,
          pdfBuffer.byteOffset + pdfBuffer.byteLength,
        ) as ArrayBuffer,
        {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="preview.pdf"',
            "Content-Length": String(pdfBuffer.length),
          },
        },
      );
    }

    // HTML template: use provided HTML or load + interpolate
    let htmlContent: string;

    if (body.htmlContent && typeof body.htmlContent === "string") {
      htmlContent = body.htmlContent;
    } else {
      const rawHtml = await readTemplateHtml(template.file_path);
      const varContext = body.context as DocumentVariableContext | undefined;
      htmlContent = varContext
        ? interpolateVariables(rawHtml, varContext)
        : rawHtml;
    }

    const pdfBuffer = await generatePdf(htmlContent);

    return new NextResponse(
      pdfBuffer.buffer.slice(
        pdfBuffer.byteOffset,
        pdfBuffer.byteOffset + pdfBuffer.byteLength,
      ) as ArrayBuffer,
      {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="preview.pdf"',
          "Content-Length": String(pdfBuffer.length),
        },
      },
    );
  } catch (err) {
    console.error("[doc-templates] preview error:", err);
    return NextResponse.json(
      { error: "Erro ao gerar preview PDF" },
      { status: 500 },
    );
  }
}

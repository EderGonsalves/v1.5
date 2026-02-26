import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { downloadSealedPdf } from "@/services/riasign";
import { getEnvelopeById } from "@/services/sign-envelopes";

type RouteContext = {
  params: Promise<{ envelopeId: string }>;
};

// GET /api/v1/sign/[envelopeId]/download — proxy sealed PDF from RIA Sign
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { envelopeId } = await context.params;
  const id = Number(envelopeId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const record = await getEnvelopeById(id);
    if (!record)
      return NextResponse.json(
        { error: "Envelope não encontrado" },
        { status: 404 },
      );

    // Permitir acesso se: SysAdmin (4), mesma instituição, ou registro sem institution_id (legado)
    const recordInstId = Number(record.institution_id) || 0;
    if (
      auth.institutionId !== 4 &&
      recordInstId !== 0 &&
      recordInstId !== auth.institutionId
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (record.status !== "completed") {
      return NextResponse.json(
        { error: "PDF selado disponível apenas para envelopes concluídos" },
        { status: 400 },
      );
    }

    const pdfBuffer = await downloadSealedPdf(record.envelope_id);
    const filename = `${record.subject.replace(/[^a-zA-Z0-9]/g, "_")}_assinado.pdf`;

    return new NextResponse(pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[sign] download error:", err);
    return NextResponse.json(
      { error: "Erro ao baixar PDF assinado" },
      { status: 500 },
    );
  }
}

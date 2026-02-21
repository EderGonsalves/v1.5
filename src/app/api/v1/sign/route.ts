import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { createEnvelopeSchema } from "@/lib/documents/schemas";
import { generatePdf, generatePdfWithPreviews } from "@/services/pdf-generator";
import {
  createEnvelope,
  uploadDocument,
  sendEnvelope,
  getEnvelope,
} from "@/services/riasign";
import {
  getEnvelopesByCaseId,
  createEnvelopeRecord,
} from "@/services/sign-envelopes";
import { getTemplateById, readTemplateFile } from "@/services/doc-templates";
import { convertDocxToHtml } from "@/services/docx-converter";
import { baserowPatch, getBaserowConfigs } from "@/services/api";

const APP_URL = process.env.APP_URL ?? "";
const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const CASES_TABLE_ID = process.env.BASEROW_CASES_TABLE_ID ?? "225";

// GET /api/v1/sign?caseId=123 — list envelopes for a case
export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const caseId = request.nextUrl.searchParams.get("caseId");
  if (!caseId)
    return NextResponse.json(
      { error: "caseId obrigatório" },
      { status: 400 },
    );

  try {
    const envelopes = await getEnvelopesByCaseId(
      Number(caseId),
      auth.institutionId,
    );
    return NextResponse.json({ envelopes });
  } catch (err) {
    console.error("[sign] GET error:", err);
    return NextResponse.json(
      { error: "Erro ao listar envelopes" },
      { status: 500 },
    );
  }
}

// POST /api/v1/sign — orchestrate: generate PDF → create envelope → upload → send
export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = createEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const {
      caseId,
      templateId,
      subject,
      htmlContent,
      signers,
      templateType,
      waba_config_id: clientWabaConfigId,
      require_otp,
      require_selfie,
    } = parsed.data;

    const tType = templateType || "html";

    // Usar waba_config_id apenas se enviado explicitamente pelo cliente
    const wabaConfigId: string | undefined = clientWabaConfigId || undefined;

    // 1. Prepare PDF (+ previews PNG) based on template type
    let pdfBuffer: Buffer;
    let previewBuffers: Buffer[] = [];
    let filename: string;

    if (tType === "direct_pdf") {
      // Direct PDF: read stored file (no previews — already a PDF)
      const template = await getTemplateById(templateId);
      if (!template)
        return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
      pdfBuffer = await readTemplateFile(template.file_path);
      filename = template.original_filename || `${subject.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    } else if (tType === "direct_docx") {
      // Direct DOCX: convert to HTML then to PDF + previews
      const template = await getTemplateById(templateId);
      if (!template)
        return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
      const docxBuffer = await readTemplateFile(template.file_path);
      const { html } = await convertDocxToHtml(docxBuffer);
      const result = await generatePdfWithPreviews(html);
      pdfBuffer = result.pdf;
      previewBuffers = result.previews;
      filename = `${subject.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    } else {
      // HTML template: generate PDF + previews from htmlContent
      if (!htmlContent) {
        return NextResponse.json(
          { error: "htmlContent obrigatório para templates HTML" },
          { status: 400 },
        );
      }
      const result = await generatePdfWithPreviews(htmlContent);
      pdfBuffer = result.pdf;
      previewBuffers = result.previews;
      filename = `${subject.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    }

    // 2. Create envelope on RIA Sign (múltiplos signatários)
    console.log("[sign] waba_config_id resolução:", {
      clientWabaConfigId,
      fallbackWabaConfigId: wabaConfigId,
      final: wabaConfigId || "(vazio — não será enviado)",
    });
    const webhookUrl = `${APP_URL}/api/v1/sign/webhook`;
    const envelope = await createEnvelope({
      subject,
      webhookUrl,
      signers: signers.map((s) => ({
        name: s.name,
        phone: s.phone,
        email: s.email || undefined,
      })),
      waba_config_id: wabaConfigId,
      use_template: false,
      require_otp: require_otp ?? false,
      require_selfie: require_selfie ?? false,
    });

    // 3. Upload PDF + previews to RIA Sign
    const doc = await uploadDocument(envelope.id, pdfBuffer, filename, "application/pdf", previewBuffers);

    // 4. Send envelope (RIA Sign dispatches via WhatsApp/email)
    const sendResult = await sendEnvelope(envelope.id);

    console.log(
      "[sign] sendEnvelope result:",
      JSON.stringify({ signers: sendResult.signers?.map((s) => ({ name: s.name, sign_url: s.sign_url, status: s.status })) }),
    );

    // 5. Build signers JSON with sign_url from send result
    // Fallback: se sendResult não tiver sign_url, buscar via getEnvelope
    let riaSigners = sendResult.signers ?? [];
    const hasSignUrls = riaSigners.some((s) => s.sign_url);

    if (!hasSignUrls && riaSigners.length === 0) {
      // sendResult pode não trazer signers — buscar envelope completo
      try {
        const fullEnvelope = await getEnvelope(envelope.id);
        riaSigners = (fullEnvelope.signers ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          sign_url: s.sign_url ?? "",
          status: s.status ?? "sent",
        }));
        console.log(
          "[sign] getEnvelope fallback signers:",
          JSON.stringify(riaSigners.map((s) => ({ name: s.name, sign_url: s.sign_url }))),
        );
      } catch (fallbackErr) {
        console.error("[sign] Fallback getEnvelope failed:", fallbackErr);
      }
    }

    const signersJson = riaSigners.map((rs, i) => ({
      name: signers[i]?.name ?? rs.name,
      phone: signers[i]?.phone ?? "",
      email: signers[i]?.email ?? "",
      sign_url: rs.sign_url ?? "",
      status: rs.status ?? "sent",
    }));

    // Se não conseguiu sign_url dos signers da API, tentar manter pelo menos o array
    if (signersJson.length === 0) {
      for (const s of signers) {
        signersJson.push({
          name: s.name,
          phone: s.phone,
          email: s.email ?? "",
          sign_url: "",
          status: "sent",
        });
      }
    }

    // Legacy fields: primeiro signatário
    const firstSigner = signers[0];
    const firstSignUrl = signersJson[0]?.sign_url ?? "";

    // 6. Save record in Baserow (table 256)
    const now = new Date().toISOString();
    const record = await createEnvelopeRecord({
      case_id: caseId,
      envelope_id: envelope.id,
      document_id: doc.id,
      template_id: templateId,
      subject,
      status: "sent",
      signer_name: firstSigner.name,
      signer_phone: firstSigner.phone,
      signer_email: firstSigner.email ?? "",
      sign_url: firstSignUrl,
      signers_json: JSON.stringify(signersJson),
      signed_at: "",
      institution_id: auth.institutionId,
      created_by_user_id: Number(auth.legacyUserId) || 0,
      created_at: now,
      updated_at: now,
    } as Omit<import("@/lib/documents/types").SignEnvelopeRow, "id">);

    // 7. Update case with sign info
    try {
      const caseUrl = `${BASEROW_API_URL}/database/rows/table/${CASES_TABLE_ID}/${caseId}/?user_field_names=true`;
      await baserowPatch(caseUrl, {
        sign_envelope_id: envelope.id,
        sign_status: "sent",
      });
    } catch (caseErr) {
      console.error("[sign] Failed to update case:", caseErr);
      // Non-critical — envelope was already sent
    }

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[sign] POST error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao criar envelope de assinatura",
      },
      { status: 500 },
    );
  }
}

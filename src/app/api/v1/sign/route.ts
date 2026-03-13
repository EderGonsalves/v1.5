import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { createEnvelopeSchema } from "@/lib/documents/schemas";
import { generatePdfWithPreviews } from "@/services/pdf-generator";
import { sendV2 } from "@/services/riasign";
import {
  getEnvelopesByCaseId,
  createEnvelopeRecord,
} from "@/services/sign-envelopes";
import { getTemplateById, readTemplateFile } from "@/services/doc-templates";
import { convertDocxToHtml } from "@/services/docx-converter";
import { updateBaserowCase } from "@/services/api";

const APP_URL = process.env.APP_URL ?? "";

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

// POST /api/v1/sign — v2: generate PDF → send in 1 call via /api/v2/send
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
      require_otp,
      require_selfie,
      require_id_photo,
      reminders,
    } = parsed.data;

    const tType = templateType || "html";

    // 1. Prepare PDF (+ previews PNG) based on template type
    let pdfBuffer: Buffer;
    let previewBuffers: Buffer[] = [];
    let filename: string;

    if (tType === "direct_pdf") {
      const template = await getTemplateById(templateId);
      if (!template)
        return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
      pdfBuffer = await readTemplateFile(template.file_path);
      filename = template.original_filename || `${subject.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    } else if (tType === "direct_docx") {
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

    // 2. Send via RIA Sign v2 (1 call: PDF + signers + send)
    const webhookUrl = `${APP_URL}/api/v1/sign/webhook`;
    const v2Result = await sendV2({
      pdfBuffer,
      filename,
      subject,
      signers: signers.map((s) => ({
        name: s.name,
        phone: s.phone,
        email: s.email || undefined,
        cpf: s.cpf || undefined,
        role: s.role || undefined,
        order: s.order,
      })),
      webhookUrl,
      selfie: require_selfie ?? false,
      idPhoto: require_id_photo ?? false,
      otp: require_otp ?? false,
      reminders: reminders ?? false,
      metadata: { caseId, institutionId: auth.institutionId },
      previewBuffers,
    });

    console.log(
      "[sign] v2/send result:",
      JSON.stringify({
        id: v2Result.id,
        status: v2Result.status,
        signers: v2Result.signers?.map((s) => ({ name: s.name, sign_url: s.sign_url, status: s.status })),
        document: v2Result.document,
      }),
    );

    // 3. Build signers JSON from v2 response
    const signersJson = (v2Result.signers ?? []).map((rs, i) => ({
      name: signers[i]?.name ?? rs.name,
      phone: signers[i]?.phone ?? rs.phone ?? "",
      email: signers[i]?.email ?? "",
      sign_url: rs.sign_url ?? "",
      status: rs.status ?? "sent",
    }));

    // Fallback if v2 didn't return signers
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

    const firstSigner = signers[0];
    const firstSignUrl = signersJson[0]?.sign_url ?? "";

    // 4. Save record in DB (table 256)
    const now = new Date().toISOString();
    const record = await createEnvelopeRecord({
      case_id: caseId,
      envelope_id: v2Result.id,
      document_id: v2Result.document?.id ?? "",
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

    // 5. Update case with sign info
    try {
      await updateBaserowCase(caseId, {
        sign_envelope_id: v2Result.id,
        sign_status: "sent",
      });
    } catch (caseErr) {
      console.error("[sign] Failed to update case:", caseErr);
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

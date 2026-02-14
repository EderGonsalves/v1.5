import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { sendTemplateSchema } from "@/lib/waba/schemas";
import { getBaserowConfigs } from "@/services/api";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEMPLATE_WEBHOOK_URL = process.env.TEMPLATE_WEBHOOK_URL ?? "";
const WEBHOOK_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDateTimeBR = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// ---------------------------------------------------------------------------
// POST /api/v1/waba/templates/send — Send template via N8N webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!TEMPLATE_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "TEMPLATE_WEBHOOK_URL não configurado" },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const parsed = sendTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const {
      caseId,
      to,
      templateName,
      templateLanguage,
      components,
      wabaPhoneNumber,
    } = parsed.data;

    // Buscar o body.auth.institutionId real da config Baserow (tabela 224)
    const configs = await getBaserowConfigs(auth.institutionId);
    const configRow = configs[0] as Record<string, unknown> | undefined;
    const baserowInstitutionId = configRow?.["body.auth.institutionId"] ?? auth.institutionId;

    // Build webhook payload matching N8N expected format
    const webhookPayload = {
      display_phone_number: wabaPhoneNumber,
      to,
      template_name: templateName,
      template_language: templateLanguage,
      template_components: components ?? [],
      "body.auth.institutionId": baserowInstitutionId,
      caseId,
      DataHora: formatDateTimeBR(new Date()),
    };

    // Send to N8N webhook
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      WEBHOOK_TIMEOUT_MS,
    );

    try {
      const response = await fetch(TEMPLATE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error(
          `Template webhook retornou ${response.status}: ${text}`,
        );
        return NextResponse.json(
          {
            error: "Falha ao enviar template pelo webhook",
            webhookStatus: response.status,
          },
          { status: 502 },
        );
      }
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ sent: true });
  } catch (err: unknown) {
    console.error("Erro ao enviar template:", err);

    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout ao enviar template pelo webhook" },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: "Erro ao enviar template" },
      { status: 500 },
    );
  }
}

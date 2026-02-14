import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getInstitutionWabaPhoneId } from "@/lib/waba";
import { getTemplate, deleteTemplate } from "@/services/waba-templates";

const SYSADMIN_INSTITUTION_ID = 4;

/** Extrai mensagem legível de erro da Meta Graph API */
const extractMetaErrorMessage = (err: unknown): { message: string; status: number; details: unknown } | null => {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as Record<string, unknown>).response === "object"
  ) {
    const axiosErr = err as { response: { status: number; data: unknown } };
    const metaData = axiosErr.response.data as Record<string, unknown> | undefined;
    const metaError = metaData?.error as Record<string, unknown> | undefined;
    const userMsg = typeof metaError?.error_user_msg === "string" ? metaError.error_user_msg : "";
    const techMsg = typeof metaError?.message === "string" ? metaError.message : "";
    const message = userMsg || techMsg || "Erro na API Meta";
    return { message, status: axiosErr.response.status, details: axiosErr.response.data };
  }
  return null;
};

type RouteParams = { templateName: string };
type RouteContext = { params: RouteParams | Promise<RouteParams> };

const resolveTargetInstitutionId = (
  auth: { institutionId: number },
  searchParams: URLSearchParams,
): number => {
  const targetParam = searchParams.get("institutionId");
  if (targetParam && auth.institutionId === SYSADMIN_INSTITUTION_ID) {
    const parsed = Number(targetParam);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return auth.institutionId;
};

// ---------------------------------------------------------------------------
// GET /api/v1/waba/templates/[templateName] — Get template details
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { templateName } = await Promise.resolve(context.params);
    const targetInstitutionId = resolveTargetInstitutionId(
      auth,
      request.nextUrl.searchParams,
    );

    const wabaId = await getInstitutionWabaPhoneId(targetInstitutionId);
    if (!wabaId) {
      return NextResponse.json(
        { error: "WABA ID não configurado para esta instituição" },
        { status: 404 },
      );
    }

    const template = await getTemplate(wabaId, templateName);
    if (!template) {
      return NextResponse.json(
        { error: "Template não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ template });
  } catch (err: unknown) {
    console.error("Erro ao buscar template:", err);
    const metaErr = extractMetaErrorMessage(err);
    if (metaErr) {
      return NextResponse.json(
        { error: metaErr.message, details: metaErr.details },
        { status: metaErr.status },
      );
    }
    return NextResponse.json(
      { error: "Erro ao buscar template" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/waba/templates/[templateName] — Delete template
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { templateName } = await Promise.resolve(context.params);
    const targetInstitutionId = resolveTargetInstitutionId(
      auth,
      request.nextUrl.searchParams,
    );

    console.log("[waba/templates/DELETE] auth.institutionId:", auth.institutionId,
      "| targetInstitutionId:", targetInstitutionId,
      "| templateName:", templateName,
      "| queryParam institutionId:", request.nextUrl.searchParams.get("institutionId"));

    const wabaId = await getInstitutionWabaPhoneId(targetInstitutionId);
    console.log("[waba/templates/DELETE] wabaId resolvido:", wabaId);

    if (!wabaId) {
      return NextResponse.json(
        { error: "WABA ID não configurado para esta instituição" },
        { status: 404 },
      );
    }

    const success = await deleteTemplate(wabaId, templateName);
    return NextResponse.json({ success });
  } catch (err: unknown) {
    console.error("Erro ao deletar template:", err);
    const metaErr = extractMetaErrorMessage(err);
    if (metaErr) {
      return NextResponse.json(
        { error: metaErr.message, details: metaErr.details },
        { status: metaErr.status },
      );
    }
    return NextResponse.json(
      { error: "Erro ao deletar template" },
      { status: 500 },
    );
  }
}

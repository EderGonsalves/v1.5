import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getInstitutionWabaPhoneId } from "@/lib/waba";
import { createTemplateSchema } from "@/lib/waba/schemas";
import {
  listTemplates,
  createTemplate,
} from "@/services/waba-templates";

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
    // Prioriza error_user_msg (mais legível) > message (técnica)
    const userMsg = typeof metaError?.error_user_msg === "string" ? metaError.error_user_msg : "";
    const techMsg = typeof metaError?.message === "string" ? metaError.message : "";
    const message = userMsg || techMsg || "Erro na API Meta";
    return { message, status: axiosErr.response.status, details: axiosErr.response.data };
  }
  return null;
};

/**
 * Resolve o institutionId alvo.
 * SysAdmin (inst 4) pode passar ?institutionId=X para gerenciar templates de outro escritório.
 */
const resolveTargetInstitutionId = (
  auth: { institutionId: number },
  searchParams: URLSearchParams,
): number => {
  const targetParam = searchParams.get("institutionId");
  if (
    targetParam &&
    auth.institutionId === SYSADMIN_INSTITUTION_ID
  ) {
    const parsed = Number(targetParam);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return auth.institutionId;
};

// ---------------------------------------------------------------------------
// GET /api/v1/waba/templates — List templates
// Query: ?status=APPROVED&limit=50&institutionId=X (SysAdmin)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
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

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") ?? undefined;
    const limit = Number(searchParams.get("limit")) || 50;

    const result = await listTemplates(wabaId, { status, limit });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Erro ao listar templates:", err);
    const metaErr = extractMetaErrorMessage(err);
    if (metaErr) {
      return NextResponse.json(
        { error: metaErr.message, details: metaErr.details },
        { status: metaErr.status },
      );
    }
    return NextResponse.json(
      { error: "Erro ao listar templates" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/waba/templates — Create template
// Body: { name, category, language, components }
// Query: ?institutionId=X (SysAdmin)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
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

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await createTemplate(wabaId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    console.error("Erro ao criar template:", err);
    const metaErr = extractMetaErrorMessage(err);
    if (metaErr) {
      return NextResponse.json(
        { error: metaErr.message, details: metaErr.details },
        { status: metaErr.status },
      );
    }
    return NextResponse.json(
      { error: "Erro ao criar template" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { fetchPermissionsOverview } from "@/services/permissions";

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json(
        { error: "Identificador do usuário ausente no token" },
        { status: 401 },
      );
    }

    const targetParam = request.nextUrl.searchParams.get("institutionId");
    const targetInstitutionId = targetParam
      ? Number.parseInt(targetParam, 10)
      : undefined;

    if (
      targetInstitutionId &&
      (!Number.isFinite(targetInstitutionId) || targetInstitutionId <= 0)
    ) {
      return NextResponse.json(
        { error: "institutionId inválido" },
        { status: 400 },
      );
    }

    const overview = await fetchPermissionsOverview(
      auth.institutionId,
      legacyUserId,
      targetInstitutionId,
    );

    return NextResponse.json(overview, { status: 200 });
  } catch (error) {
    console.error("[api/v1/permissions/overview] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar permissões",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { fetchPermissionsStatus } from "@/services/permissions";

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

    const email = typeof auth.payload?.email === "string"
      ? auth.payload.email
      : undefined;

    const status = await fetchPermissionsStatus(
      auth.institutionId,
      legacyUserId,
      email,
    );

    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    console.error("[api/v1/permissions/status] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao verificar status de permissões",
      },
      { status: 500 },
    );
  }
}

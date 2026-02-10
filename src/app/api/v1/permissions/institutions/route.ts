import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { listInstitutions } from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (auth.institutionId !== GLOBAL_ADMIN_INSTITUTION_ID) {
      return NextResponse.json(
        { error: "Acesso restrito ao admin global" },
        { status: 403 },
      );
    }

    const institutions = await listInstitutions();

    return NextResponse.json({ institutions }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/permissions/institutions] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar instituições",
      },
      { status: 500 },
    );
  }
}

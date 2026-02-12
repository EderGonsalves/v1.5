import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { resetAllOfficeAdminFlags } from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

/**
 * POST /api/v1/users/reset-admin
 * Reseta is_office_admin para false em todos os usuários.
 * Apenas SysAdmin pode executar.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (auth.institutionId !== GLOBAL_ADMIN_INSTITUTION_ID) {
      return NextResponse.json(
        { error: "Apenas SysAdmin pode executar esta ação" },
        { status: 403 },
      );
    }

    const count = await resetAllOfficeAdminFlags();

    return NextResponse.json({
      message: `Reset concluído. ${count} usuário(s) atualizados.`,
      count,
    });
  } catch (error) {
    console.error("[api/v1/users/reset-admin] POST error", error);
    return NextResponse.json(
      {
        error: "Erro ao resetar flags",
      },
      { status: 500 },
    );
  }
}

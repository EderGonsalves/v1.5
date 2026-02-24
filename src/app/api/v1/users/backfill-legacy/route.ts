import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { backfillLegacyUserIds } from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

/**
 * POST /api/v1/users/backfill-legacy
 *
 * Sets legacy_user_id = String(row.id) for every user that has it empty.
 * Restricted to SysAdmin (institution 4).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (auth.institutionId !== GLOBAL_ADMIN_INSTITUTION_ID) {
      return NextResponse.json(
        { error: "Apenas SysAdmin pode executar o backfill" },
        { status: 403 },
      );
    }

    const result = await backfillLegacyUserIds();

    return NextResponse.json(
      {
        message: `Backfill concluído: ${result.updated} atualizados, ${result.skipped} já tinham legacy_user_id`,
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/v1/users/backfill-legacy] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao executar backfill",
      },
      { status: 500 },
    );
  }
}

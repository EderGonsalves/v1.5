import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { seedInstitutionTags, isGlobalAdmin } from "@/services/tags";

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let targetInstitutionId = auth.institutionId;

    // Allow sysAdmin to seed for a specific institution
    if (isGlobalAdmin(auth.institutionId)) {
      try {
        const body = await request.json();
        if (body?.institutionId && Number.isFinite(Number(body.institutionId))) {
          targetInstitutionId = Number(body.institutionId);
        }
      } catch {
        // No body or invalid JSON → use auth institution
      }
    }

    const result = await seedInstitutionTags(targetInstitutionId);

    return NextResponse.json(
      {
        message: `Seed concluído para instituição ${targetInstitutionId}`,
        created: result.created,
        existing: result.existing,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/v1/tags/seed] POST error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao executar seed de tags",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import { fetchBatchCaseTags } from "@/services/tags";

const batchSchema = z.object({
  caseIds: z.array(z.number().int().positive()).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const caseTags = await fetchBatchCaseTags(
      parsed.data.caseIds,
      auth.institutionId,
    );
    return NextResponse.json({ caseTags }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags/cases/batch] POST error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar tags em lote" },
      { status: 500 },
    );
  }
}

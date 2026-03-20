import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { fetchTagsWithCriteria, isGlobalAdmin } from "@/services/tags";

export async function GET(request: NextRequest) {
  try {
    // Accept both cookie auth and API key
    const auth = getRequestAuth(request);
    const apiKey = process.env.TAGS_API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!auth && !(apiKey && authHeader?.replace("Bearer ", "").trim() === apiKey)) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const institutionIdParam = request.nextUrl.searchParams.get("institutionId");
    let institutionId: number;

    if (auth) {
      institutionId = institutionIdParam && isGlobalAdmin(auth.institutionId)
        ? Number(institutionIdParam)
        : auth.institutionId;
    } else {
      if (!institutionIdParam) {
        return NextResponse.json({ error: "institutionId é obrigatório" }, { status: 400 });
      }
      institutionId = Number(institutionIdParam);
    }

    if (!Number.isFinite(institutionId) || institutionId <= 0) {
      return NextResponse.json({ error: "institutionId inválido" }, { status: 400 });
    }

    const tags = await fetchTagsWithCriteria(institutionId);
    return NextResponse.json({ tags }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags/criteria] GET error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar critérios" },
      { status: 500 },
    );
  }
}

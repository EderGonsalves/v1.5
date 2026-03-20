import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import { fetchCaseTags, setCaseTags } from "@/services/tags";

const setCaseTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()),
});

type RouteContext = { params: Promise<{ caseId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { caseId: rawId } = await context.params;
    const caseId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      return NextResponse.json({ error: "caseId inválido" }, { status: 400 });
    }

    const tags = await fetchCaseTags(caseId, auth.institutionId);
    return NextResponse.json({ tags }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags/case/[caseId]] GET error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar tags do caso" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { caseId: rawId } = await context.params;
    const caseId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      return NextResponse.json({ error: "caseId inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = setCaseTagsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const assignedBy = auth.legacyUserId ?? auth.payload?.email ?? "user";
    const tags = await setCaseTags(
      caseId,
      auth.institutionId,
      parsed.data.tagIds,
      String(assignedBy),
    );
    return NextResponse.json({ tags }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags/case/[caseId]] PUT error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar tags do caso" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchInstitutionTags,
  fetchAllTags,
  createInstitutionTag,
  isGlobalAdmin,
} from "@/services/tags";

const createTagSchema = z.object({
  category: z.enum(["area_direito", "sub_area", "urgencia", "estagio", "qualidade_lead", "custom"]),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
  parentTagId: z.number().int().positive().nullable().optional(),
  aiCriteria: z.string().max(2000).optional(),
  institutionId: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const isSysAdmin = isGlobalAdmin(auth.institutionId);
    const targetParam = request.nextUrl.searchParams.get("institutionId");
    const category = request.nextUrl.searchParams.get("category") || undefined;
    const targetInstitutionId = targetParam ? Number.parseInt(targetParam, 10) : undefined;

    let tags;
    if (isSysAdmin && !targetInstitutionId) {
      tags = await fetchAllTags();
      if (category) tags = tags.filter((t) => t.category === category);
    } else {
      const instId = isSysAdmin && targetInstitutionId
        ? targetInstitutionId
        : auth.institutionId;
      tags = await fetchInstitutionTags(instId, category);
    }

    return NextResponse.json({ tags }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags] GET error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar tags" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const isSysAdmin = isGlobalAdmin(auth.institutionId);
    const targetInstitutionId = isSysAdmin && parsed.data.institutionId
      ? parsed.data.institutionId
      : auth.institutionId;

    const { institutionId: _, ...tagData } = parsed.data;
    const tag = await createInstitutionTag(targetInstitutionId, tagData);
    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    console.error("[api/v1/tags] POST error", error);
    const status = error instanceof Error && error.message.includes("Já existe") ? 409 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar tag" },
      { status },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchAllTags,
  updateInstitutionTag,
  deleteInstitutionTag,
  isGlobalAdmin,
} from "@/services/tags";

const updateTagSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  aiCriteria: z.string().max(2000).optional(),
});

type RouteContext = { params: Promise<{ tagId: string }> };

const resolveTagInstitution = async (
  authInstitutionId: number,
  tagId: number,
): Promise<number | null> => {
  if (!isGlobalAdmin(authInstitutionId)) return authInstitutionId;

  const allTags = await fetchAllTags();
  const target = allTags.find((t) => t.id === tagId);
  return target?.institutionId ?? null;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { tagId: rawId } = await context.params;
    const tagId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(tagId) || tagId <= 0) {
      return NextResponse.json({ error: "tagId inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const targetInstitutionId = await resolveTagInstitution(auth.institutionId, tagId);
    if (!targetInstitutionId) {
      return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });
    }

    const tag = await updateInstitutionTag(targetInstitutionId, tagId, parsed.data);
    return NextResponse.json({ tag }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/tags/[tagId]] PUT error", error);
    const status =
      error instanceof Error && error.message.includes("não encontrada")
        ? 404
        : error instanceof Error && error.message.includes("Já existe")
          ? 409
          : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar tag" },
      { status },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { tagId: rawId } = await context.params;
    const tagId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(tagId) || tagId <= 0) {
      return NextResponse.json({ error: "tagId inválido" }, { status: 400 });
    }

    const targetInstitutionId = await resolveTagInstitution(auth.institutionId, tagId);
    if (!targetInstitutionId) {
      return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });
    }

    await deleteInstitutionTag(targetInstitutionId, tagId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[api/v1/tags/[tagId]] DELETE error", error);
    const status =
      error instanceof Error && error.message.includes("não encontrada")
        ? 404
        : error instanceof Error && error.message.includes("customizadas")
          ? 400
          : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir tag" },
      { status },
    );
  }
}

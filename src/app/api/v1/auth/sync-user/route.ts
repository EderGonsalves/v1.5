import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import { syncUserRecord } from "@/services/permissions";

const SYSADMIN_INSTITUTION_ID = 4;

const payloadSchema = z.object({
  institutionId: z.coerce.number().int().positive(),
  legacyUserId: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
  password: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 },
      );
    }

    const json = await request.json();
    const { institutionId, legacyUserId, email, name, password, isActive } =
      payloadSchema.parse(json);

    // Only sysadmin can sync users for other institutions
    if (
      auth.institutionId !== SYSADMIN_INSTITUTION_ID &&
      auth.institutionId !== institutionId
    ) {
      return NextResponse.json(
        { error: "Sem permissão para esta instituição" },
        { status: 403 },
      );
    }

    const result = await syncUserRecord({
      institutionId,
      legacyUserId,
      email: email?.toLowerCase(),
      name,
      password,
      isActive,
    });

    return NextResponse.json(
      {
        status: result.created ? "created" : "updated",
        userId: result.user.id,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("[api/v1/auth/sync-user] error", error);
    return NextResponse.json(
      { error: "Erro ao sincronizar usuário" },
      { status: 500 },
    );
  }
}

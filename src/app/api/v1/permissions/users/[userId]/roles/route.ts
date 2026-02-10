import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { updateUserRolesAssignments } from "@/services/permissions";

const payloadSchema = z.object({
  roleIds: z.array(z.coerce.number().int().positive()).default([]),
  institutionId: z.coerce.number().int().positive().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json(
        { error: "Identificador do usuário ausente no token" },
        { status: 401 },
      );
    }

    const { userId: userIdParam } = await params;
    const userId = Number.parseInt(userIdParam, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "userId inválido" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { roleIds, institutionId: targetInstitutionId } =
      payloadSchema.parse(body);

    await updateUserRolesAssignments({
      institutionId: auth.institutionId,
      legacyUserId,
      userId,
      roleIds,
      targetInstitutionId,
    });

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("[api/v1/permissions/users/[userId]/roles] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar papéis do usuário",
      },
      { status: 500 },
    );
  }
}

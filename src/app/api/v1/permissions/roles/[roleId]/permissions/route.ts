import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { updateRolePermissions } from "@/services/permissions";

const payloadSchema = z.object({
  permissionIds: z.array(z.coerce.number().int().positive()).default([]),
  institutionId: z.coerce.number().int().positive().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
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

    const { roleId: roleIdParam } = await params;
    const roleId = Number.parseInt(roleIdParam, 10);
    if (!Number.isFinite(roleId) || roleId <= 0) {
      return NextResponse.json(
        { error: "roleId inválido" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { permissionIds, institutionId: targetInstitutionId } =
      payloadSchema.parse(body);

    await updateRolePermissions({
      institutionId: auth.institutionId,
      legacyUserId,
      roleId,
      permissionIds,
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

    console.error("[api/v1/permissions/roles/[roleId]/permissions] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar permissões do papel",
      },
      { status: 500 },
    );
  }
}

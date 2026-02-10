import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchInstitutionUsers,
  fetchAllUsers,
  updateInstitutionUser,
  deleteInstitutionUser,
} from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("E-mail inválido").max(200).optional(),
  password: z.string().min(4).max(200).optional(),
  phone: z.string().max(50).optional(),
  oab: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ userId: string }> };

const resolveUserInstitution = async (
  authInstitutionId: number,
  userId: number,
): Promise<number | null> => {
  const isSysAdmin = authInstitutionId === GLOBAL_ADMIN_INSTITUTION_ID;
  if (!isSysAdmin) return authInstitutionId;

  // sysAdmin: find which institution the target user belongs to
  const allUsers = await fetchAllUsers();
  const target = allUsers.find((u) => u.id === userId);
  return target?.institutionId ?? null;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { userId: rawId } = await context.params;
    const userId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "userId inválido" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const targetInstitutionId = await resolveUserInstitution(
      auth.institutionId,
      userId,
    );
    if (!targetInstitutionId) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    const user = await updateInstitutionUser(
      targetInstitutionId,
      userId,
      parsed.data,
    );
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/users/[userId]] PUT error", error);
    const status =
      error instanceof Error && error.message.includes("não encontrado")
        ? 404
        : error instanceof Error && error.message.includes("Já existe")
          ? 409
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar usuário",
      },
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

    const { userId: rawId } = await context.params;
    const userId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "userId inválido" },
        { status: 400 },
      );
    }

    const targetInstitutionId = await resolveUserInstitution(
      auth.institutionId,
      userId,
    );
    if (!targetInstitutionId) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    await deleteInstitutionUser(targetInstitutionId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[api/v1/users/[userId]] DELETE error", error);
    const status =
      error instanceof Error && error.message.includes("não encontrado")
        ? 404
        : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao excluir usuário",
      },
      { status },
    );
  }
}

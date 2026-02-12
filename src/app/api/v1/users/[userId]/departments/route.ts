import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  getUserDepartmentIds,
  setUserDepartments,
  fetchInstitutionDepartments,
  isGlobalAdmin,
} from "@/services/departments";
import { fetchAllUsers } from "@/services/permissions";

const setDepartmentsSchema = z.object({
  departmentIds: z.array(z.number().int().positive()),
  primaryDepartmentId: z.number().int().positive().optional(),
});

type RouteContext = { params: Promise<{ userId: string }> };

const resolveUserInstitution = async (
  authInstitutionId: number,
  userId: number,
): Promise<number | null> => {
  if (!isGlobalAdmin(authInstitutionId)) return authInstitutionId;

  const allUsers = await fetchAllUsers();
  const target = allUsers.find((u) => u.id === userId);
  return target?.institutionId ?? null;
};

export async function GET(request: NextRequest, context: RouteContext) {
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

    const departmentIds = await getUserDepartmentIds(
      userId,
      targetInstitutionId,
    );
    const allDepartments =
      await fetchInstitutionDepartments(targetInstitutionId);
    const departments = allDepartments.filter((d) =>
      departmentIds.includes(d.id),
    );

    return NextResponse.json({ departments, departmentIds }, { status: 200 });
  } catch (error) {
    console.error("[users/[userId]/departments] GET error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar departamentos do usuário",
      },
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

    const { userId: rawId } = await context.params;
    const userId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "userId inválido" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = setDepartmentsSchema.safeParse(body);
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

    await setUserDepartments(
      userId,
      targetInstitutionId,
      parsed.data.departmentIds,
      parsed.data.primaryDepartmentId,
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[users/[userId]/departments] PUT error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar departamentos do usuário",
      },
      { status: 500 },
    );
  }
}

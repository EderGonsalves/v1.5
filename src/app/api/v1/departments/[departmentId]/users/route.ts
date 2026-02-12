import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchDepartmentUserIds,
  setDepartmentUsers,
  fetchDepartmentById,
  isGlobalAdmin,
} from "@/services/departments";
import { fetchInstitutionUsers, fetchAllUsers } from "@/services/permissions";

const setUsersSchema = z.object({
  userIds: z.array(z.number().int().positive()),
});

type RouteContext = { params: Promise<{ departmentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { departmentId: rawId } = await context.params;
    const departmentId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(departmentId) || departmentId <= 0) {
      return NextResponse.json(
        { error: "departmentId inválido" },
        { status: 400 },
      );
    }

    const dept = await fetchDepartmentById(departmentId);
    if (!dept) {
      return NextResponse.json(
        { error: "Departamento não encontrado" },
        { status: 404 },
      );
    }

    // Verify access
    const isSysAdmin = isGlobalAdmin(auth.institutionId);
    if (!isSysAdmin && dept.institutionId !== auth.institutionId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const userIds = await fetchDepartmentUserIds(departmentId);

    // Resolve user details
    const allUsers = dept.institutionId
      ? await fetchInstitutionUsers(dept.institutionId)
      : await fetchAllUsers();

    const users = allUsers.filter((u) => userIds.includes(u.id));

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("[departments/[id]/users] GET error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar usuários do departamento",
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

    const { departmentId: rawId } = await context.params;
    const departmentId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(departmentId) || departmentId <= 0) {
      return NextResponse.json(
        { error: "departmentId inválido" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = setUsersSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const dept = await fetchDepartmentById(departmentId);
    if (!dept || !dept.institutionId) {
      return NextResponse.json(
        { error: "Departamento não encontrado" },
        { status: 404 },
      );
    }

    const isSysAdmin = isGlobalAdmin(auth.institutionId);
    if (!isSysAdmin && dept.institutionId !== auth.institutionId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    await setDepartmentUsers(
      departmentId,
      dept.institutionId,
      parsed.data.userIds,
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[departments/[id]/users] PUT error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar membros do departamento",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchAllDepartments,
  updateInstitutionDepartment,
  deleteInstitutionDepartment,
  isGlobalAdmin,
} from "@/services/departments";

const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ departmentId: string }> };

const resolveDepartmentInstitution = async (
  authInstitutionId: number,
  departmentId: number,
): Promise<number | null> => {
  if (!isGlobalAdmin(authInstitutionId)) return authInstitutionId;

  const allDepartments = await fetchAllDepartments();
  const target = allDepartments.find((d) => d.id === departmentId);
  return target?.institutionId ?? null;
};

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
    const parsed = updateDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const targetInstitutionId = await resolveDepartmentInstitution(
      auth.institutionId,
      departmentId,
    );
    if (!targetInstitutionId) {
      return NextResponse.json(
        { error: "Departamento não encontrado" },
        { status: 404 },
      );
    }

    const department = await updateInstitutionDepartment(
      targetInstitutionId,
      departmentId,
      parsed.data,
    );
    return NextResponse.json({ department }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/departments/[departmentId]] PUT error", error);
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
            : "Erro ao atualizar departamento",
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

    const { departmentId: rawId } = await context.params;
    const departmentId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(departmentId) || departmentId <= 0) {
      return NextResponse.json(
        { error: "departmentId inválido" },
        { status: 400 },
      );
    }

    const targetInstitutionId = await resolveDepartmentInstitution(
      auth.institutionId,
      departmentId,
    );
    if (!targetInstitutionId) {
      return NextResponse.json(
        { error: "Departamento não encontrado" },
        { status: 404 },
      );
    }

    await deleteInstitutionDepartment(targetInstitutionId, departmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[api/v1/departments/[departmentId]] DELETE error", error);
    const status =
      error instanceof Error && error.message.includes("não encontrado")
        ? 404
        : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao excluir departamento",
      },
      { status },
    );
  }
}

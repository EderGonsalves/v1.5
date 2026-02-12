import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchInstitutionDepartments,
  fetchAllDepartments,
  createInstitutionDepartment,
  isGlobalAdmin,
} from "@/services/departments";

const createDepartmentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(500).optional(),
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
    const targetInstitutionId = targetParam
      ? Number.parseInt(targetParam, 10)
      : undefined;

    let departments;
    if (isSysAdmin) {
      if (targetInstitutionId && Number.isFinite(targetInstitutionId)) {
        departments = await fetchInstitutionDepartments(targetInstitutionId);
      } else {
        departments = await fetchAllDepartments();
      }
    } else {
      departments = await fetchInstitutionDepartments(auth.institutionId);
    }

    return NextResponse.json({ departments }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/departments] GET error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar departamentos",
      },
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
    const parsed = createDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const isSysAdmin = isGlobalAdmin(auth.institutionId);
    const targetInstitutionId =
      isSysAdmin && parsed.data.institutionId
        ? parsed.data.institutionId
        : auth.institutionId;

    const { institutionId: _, ...deptData } = parsed.data;
    const department = await createInstitutionDepartment(
      targetInstitutionId,
      deptData,
    );
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    console.error("[api/v1/departments] POST error", error);
    const status =
      error instanceof Error && error.message.includes("Já existe")
        ? 409
        : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao criar departamento",
      },
      { status },
    );
  }
}

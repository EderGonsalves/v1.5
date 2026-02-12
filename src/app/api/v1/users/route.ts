import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth/session";
import {
  fetchInstitutionUsers,
  fetchAllUsers,
  createInstitutionUser,
} from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  email: z.string().email("E-mail inválido").max(200),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres").max(200),
  phone: z.string().max(50).optional(),
  oab: z.string().max(50).optional(),
  institutionId: z.number().int().positive().optional(),
  isOfficeAdmin: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const isSysAdmin = auth.institutionId === GLOBAL_ADMIN_INSTITUTION_ID;
    const targetParam = request.nextUrl.searchParams.get("institutionId");
    const targetInstitutionId = targetParam
      ? Number.parseInt(targetParam, 10)
      : undefined;

    // sysAdmin without filter → all users; sysAdmin with filter → filtered
    // non-sysAdmin → own institution only
    let users;
    if (isSysAdmin) {
      if (targetInstitutionId && Number.isFinite(targetInstitutionId)) {
        users = await fetchInstitutionUsers(targetInstitutionId);
      } else {
        users = await fetchAllUsers();
      }
    } else {
      users = await fetchInstitutionUsers(auth.institutionId);
    }

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/users] GET error", error);
    return NextResponse.json(
      {
        error: "Erro ao listar usuários",
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
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const isSysAdmin = auth.institutionId === GLOBAL_ADMIN_INSTITUTION_ID;
    const targetInstitutionId =
      isSysAdmin && parsed.data.institutionId
        ? parsed.data.institutionId
        : auth.institutionId;

    const { institutionId: _, isOfficeAdmin, ...userData } = parsed.data;
    const user = await createInstitutionUser(targetInstitutionId, {
      ...userData,
      isOfficeAdmin,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[api/v1/users] POST error", error);
    const isDuplicate =
      error instanceof Error && error.message.includes("Já existe");
    return NextResponse.json(
      { error: isDuplicate ? "Usuário já existe" : "Erro ao criar usuário" },
      { status: isDuplicate ? 409 : 500 },
    );
  }
}

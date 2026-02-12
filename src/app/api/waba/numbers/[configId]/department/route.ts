import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { updateBaserowConfig } from "@/services/api";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> },
) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { configId: configIdStr } = await params;
  const configId = Number(configIdStr);
  if (!configId || isNaN(configId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { departmentId, departmentName } = body as {
      departmentId: number | null;
      departmentName: string | null;
    };

    const updated = await updateBaserowConfig(configId, {
      phone_department_id: departmentId ?? null,
      phone_department_name: departmentName ?? null,
    } as Record<string, unknown>);

    return NextResponse.json({ config: updated });
  } catch (err) {
    console.error("Erro ao atualizar departamento do número:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar" },
      { status: 500 },
    );
  }
}

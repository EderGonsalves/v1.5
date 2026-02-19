import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { getQueueMode, getLatestConfigRowId } from "@/lib/queue-mode";
import { updateBaserowConfig } from "@/services/api";
import { fetchPermissionsStatus } from "@/services/permissions";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const queueMode = await getQueueMode(auth.institutionId);
    return NextResponse.json({ queueMode });
  } catch (err) {
    console.error("Erro ao buscar queue mode:", err);
    return NextResponse.json(
      { error: "Erro ao buscar modo de fila" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Only admins can change queue mode
  const legacyId = resolveLegacyIdentifier(auth);
  if (!legacyId) {
    return NextResponse.json({ error: "Usuário não identificado" }, { status: 403 });
  }

  const perms = await fetchPermissionsStatus(auth.institutionId, legacyId);
  if (!perms.isSysAdmin && !perms.isOfficeAdmin) {
    return NextResponse.json(
      { error: "Apenas administradores podem alterar o modo de fila" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { queueMode } = body as { queueMode?: string };
  if (queueMode !== "round_robin" && queueMode !== "manual") {
    return NextResponse.json(
      { error: "queueMode deve ser 'round_robin' ou 'manual'" },
      { status: 400 },
    );
  }

  try {
    const rowId = await getLatestConfigRowId(auth.institutionId);
    if (!rowId) {
      return NextResponse.json(
        { error: "Nenhuma configuração encontrada para esta instituição" },
        { status: 404 },
      );
    }

    await updateBaserowConfig(rowId, { queue_mode: queueMode });
    return NextResponse.json({ success: true, queueMode });
  } catch (err) {
    console.error("Erro ao atualizar queue mode:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar modo de fila" },
      { status: 500 },
    );
  }
}

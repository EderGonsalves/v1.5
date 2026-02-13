import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { fetchInstitutionUsers } from "@/services/permissions";
import { fetchUserQueueStats } from "@/services/assignment-queue";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = Number(url.searchParams.get("userId"));
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json(
      { error: "userId inválido" },
      { status: 400 },
    );
  }

  try {
    const institutionId = auth.institutionId;

    // Get eligible user IDs for position calculation
    const users = await fetchInstitutionUsers(institutionId);
    const eligibleUserIds = users
      .filter((u) => u.isActive && u.receivesCases)
      .map((u) => u.id);

    const stats = await fetchUserQueueStats(userId, institutionId, eligibleUserIds);

    return NextResponse.json(stats);
  } catch (err) {
    console.error("[assignment-queue/stats] GET error:", err);
    return NextResponse.json(
      { error: "Erro ao buscar estatísticas da fila" },
      { status: 500 },
    );
  }
}

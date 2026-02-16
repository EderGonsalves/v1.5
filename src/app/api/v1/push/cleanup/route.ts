import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";
import { cleanupLegacySubscriptions } from "@/services/push";

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const result = await cleanupLegacySubscriptions();

  return NextResponse.json({
    ok: true,
    deleted: result.deleted,
    kept: result.kept,
    message: `${result.deleted} subscription(s) legacy removida(s), ${result.kept} VAPID mantida(s).`,
  });
}

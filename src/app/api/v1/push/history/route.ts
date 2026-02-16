import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";
import { getNotificationHistory } from "@/services/push";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page")) || 1;

  const data = await getNotificationHistory({ page, size: 20 });
  return NextResponse.json(data);
}

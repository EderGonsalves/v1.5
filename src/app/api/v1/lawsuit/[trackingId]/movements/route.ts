import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getMovementsByTrackingId } from "@/services/lawsuit";

type RouteParams = { trackingId: string };
type RouteContext = { params: RouteParams | Promise<RouteParams> };

// ---------------------------------------------------------------------------
// GET /api/v1/lawsuit/[trackingId]/movements?page=1&size=25
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { trackingId } = await Promise.resolve(context.params);
    const id = Number(trackingId);
    if (!id || id <= 0) {
      return NextResponse.json({ error: "trackingId inválido" }, { status: 400 });
    }

    const page = Number(request.nextUrl.searchParams.get("page")) || 1;
    const size = Number(request.nextUrl.searchParams.get("size")) || 25;

    const result = await getMovementsByTrackingId(id, { page, size });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[lawsuit] Erro ao buscar movimentações:", err);
    return NextResponse.json(
      { error: "Erro ao buscar movimentações" },
      { status: 500 },
    );
  }
}

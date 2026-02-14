import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { queryLawsuitOnce } from "@/services/codilo";
import { getTrackingById } from "@/services/lawsuit";

const APP_URL = process.env.APP_URL ?? "https://waba.riasistemas.com.br";

// ---------------------------------------------------------------------------
// POST /api/v1/lawsuit/query — One-time lawsuit query via Codilo
// Body: { trackingId }
//
// Sends an async query to Codilo. Results arrive via webhook callback
// at /api/v1/lawsuit/webhook, which creates movements in our database.
// The client polls the movements endpoint to detect when results arrive.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { trackingId } = body as { trackingId: number };

    if (!trackingId || trackingId <= 0) {
      return NextResponse.json(
        { error: "trackingId obrigatório" },
        { status: 400 },
      );
    }

    const tracking = await getTrackingById(trackingId);
    if (!tracking) {
      return NextResponse.json(
        { error: "Acompanhamento não encontrado" },
        { status: 404 },
      );
    }

    const callbackUrl = `${APP_URL}/api/v1/lawsuit/webhook`;
    const result = await queryLawsuitOnce(
      tracking.cnj,
      callbackUrl,
      tracking.case_id,
    );

    console.log("[lawsuit/query] Consulta enviada para Codilo:", {
      cnj: tracking.cnj,
      caseId: tracking.case_id,
      autorequestId: result.autorequestId,
      subRequests: result.subRequestIds.length,
    });

    return NextResponse.json({
      sent: true,
      autorequestId: result.autorequestId,
      subRequests: result.subRequestIds.length,
    });
  } catch (err) {
    console.error("[lawsuit/query] Erro:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao consultar" },
      { status: 500 },
    );
  }
}

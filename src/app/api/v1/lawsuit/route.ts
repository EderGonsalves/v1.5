import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import {
  getTrackingByCaseId,
  createTracking,
} from "@/services/lawsuit";
import { startLawsuitMonitoring } from "@/services/codilo";

const APP_URL = process.env.APP_URL ?? "https://waba.riasistemas.com.br";

// ---------------------------------------------------------------------------
// GET /api/v1/lawsuit?caseId=123 — List tracking for a case
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const caseId = Number(request.nextUrl.searchParams.get("caseId"));
  if (!caseId || caseId <= 0) {
    return NextResponse.json({ error: "caseId obrigatório" }, { status: 400 });
  }

  try {
    const trackings = await getTrackingByCaseId(caseId, auth.institutionId);
    return NextResponse.json({ trackings });
  } catch (err) {
    console.error("[lawsuit] Erro ao listar:", err);
    return NextResponse.json(
      { error: "Erro ao buscar acompanhamentos" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/lawsuit — Start monitoring a CNJ
// Body: { caseId, cnj, institutionId }
// ---------------------------------------------------------------------------

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { caseId, cnj, institutionId } = body as {
      caseId: number;
      cnj: string;
      institutionId: number;
    };

    if (!caseId || !cnj) {
      return NextResponse.json(
        { error: "caseId e cnj são obrigatórios" },
        { status: 400 },
      );
    }

    if (!CNJ_REGEX.test(cnj)) {
      return NextResponse.json(
        { error: "Formato CNJ inválido. Esperado: NNNNNNN-DD.AAAA.J.TR.OOOO" },
        { status: 400 },
      );
    }

    const callbackUrl = `${APP_URL}/api/v1/lawsuit/webhook`;
    const now = new Date().toISOString();

    // 1. Register in Codilo for daily monitoring
    let codiloResult;
    try {
      codiloResult = await startLawsuitMonitoring(cnj, callbackUrl, caseId);
    } catch (err) {
      console.error("[lawsuit] Codilo monitoring error:", err);
      // Create tracking even if Codilo fails (user can retry)
      const tracking = await createTracking({
        case_id: caseId,
        institution_id: institutionId ?? auth.institutionId,
        cnj,
        is_active: "true",
        codilo_process_id: "",
        status: "error",
        error_message: err instanceof Error ? err.message : "Erro ao registrar na Codilo",
        movements_count: 0,
        last_update_at: "",
        created_at: now,
        updated_at: now,
      });
      return NextResponse.json(tracking, { status: 201 });
    }

    // 2. Create tracking row in Baserow
    const tracking = await createTracking({
      case_id: caseId,
      institution_id: institutionId ?? auth.institutionId,
      cnj,
      is_active: "true",
      codilo_process_id: codiloResult.id ?? "",
      status: "monitoring",
      error_message: "",
      movements_count: 0,
      last_update_at: "",
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json(tracking, { status: 201 });
  } catch (err) {
    console.error("[lawsuit] Erro ao criar monitoramento:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar monitoramento" },
      { status: 500 },
    );
  }
}

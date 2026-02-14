import { NextRequest, NextResponse } from "next/server";
import { validateCodiloCallback } from "@/services/codilo";
import {
  getTrackingByCaseId,
  createMovement,
  updateTracking,
  getMovementsByTrackingId,
  buildLawsuitSummary,
} from "@/services/lawsuit";
import { baserowPatch } from "@/services/api";

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const CASES_TABLE_ID = process.env.BASEROW_CASES_TABLE_ID ?? "225";

// ---------------------------------------------------------------------------
// POST /api/v1/lawsuit/webhook — Codilo callback (CSRF exempt)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Validate callback authenticity
  // Push API sends headers; Capture API (autorequest) sends query params
  const webhookSecret =
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");
  const userAgent = request.headers.get("user-agent");

  if (!validateCodiloCallback(webhookSecret, userAgent)) {
    console.warn("[lawsuit/webhook] Invalid callback:", {
      hasSecret: !!webhookSecret,
      userAgent,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Extract case ID from headers or query params
  const caseIdRaw =
    request.headers.get("x-case-id") ||
    request.nextUrl.searchParams.get("caseId");
  const caseId = Number(caseIdRaw);
  if (!caseId || caseId <= 0) {
    console.warn("[lawsuit/webhook] Missing or invalid caseId:", caseIdRaw);
    return NextResponse.json({ error: "caseId inválido" }, { status: 400 });
  }

  try {
    // 3. Parse body
    const body = await request.json();
    console.log("[lawsuit/webhook] Received callback for case", caseId);

    // 4. Find active tracking for this case
    const trackings = await getTrackingByCaseId(caseId);
    const tracking = trackings.find((t) => t.is_active === "true");
    if (!tracking) {
      console.warn("[lawsuit/webhook] No active tracking for case", caseId);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 5. Extract movements from callback payload
    const movements = extractMovements(body, tracking.id, caseId, tracking.institution_id);
    const now = new Date().toISOString();

    // 6. Create movements in Baserow
    let createdCount = 0;
    for (const mov of movements) {
      try {
        await createMovement(mov);
        createdCount++;
      } catch (err) {
        console.error("[lawsuit/webhook] Error creating movement:", err);
      }
    }

    // 7. Update tracking stats
    const currentCount = tracking.movements_count || 0;
    await updateTracking(tracking.id, {
      movements_count: currentCount + createdCount,
      last_update_at: now,
      updated_at: now,
      status: "monitoring",
      error_message: "",
    });

    // 8. Update lawsuit_summary on the case
    try {
      const allMovements = await getMovementsByTrackingId(tracking.id, { page: 1, size: 5 });
      const summary = buildLawsuitSummary(
        { ...tracking, movements_count: currentCount + createdCount },
        allMovements.results,
      );

      const caseUrl = `${BASEROW_API_URL}/database/rows/table/${CASES_TABLE_ID}/${caseId}/?user_field_names=true`;
      await baserowPatch(caseUrl, {
        lawsuit_summary: summary,
        lawsuit_last_update: now,
        lawsuit_tracking_active: "true",
      });
    } catch (err) {
      console.error("[lawsuit/webhook] Error updating case summary:", err);
    }

    return NextResponse.json({ ok: true, created: createdCount });
  } catch (err) {
    console.error("[lawsuit/webhook] Error processing callback:", err);
    return NextResponse.json(
      { error: "Erro ao processar callback" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers — Extract movements from Codilo callback payload
// ---------------------------------------------------------------------------

type RawMovement = {
  date?: string;
  tipo?: string;
  type?: string;
  titulo?: string;
  title?: string;
  descricao?: string;
  description?: string;
  content?: string;
  tribunal?: string;
  court?: string;
  source_court?: string;
};

function extractMovements(
  body: unknown,
  trackingId: number,
  caseId: number,
  institutionId: number,
): Array<Omit<import("@/services/lawsuit").LawsuitMovement, "id">> {
  const now = new Date().toISOString();
  const results: Array<Omit<import("@/services/lawsuit").LawsuitMovement, "id">> = [];

  // Codilo may send movements in different shapes
  const payload = body as Record<string, unknown>;

  // Case 1: Array of movements directly
  const items: RawMovement[] = [];

  if (Array.isArray(payload.movimentacoes)) {
    items.push(...(payload.movimentacoes as RawMovement[]));
  } else if (Array.isArray(payload.movements)) {
    items.push(...(payload.movements as RawMovement[]));
  } else if (Array.isArray(payload.data)) {
    items.push(...(payload.data as RawMovement[]));
  } else if (Array.isArray(payload.results)) {
    // May contain nested results from different courts
    for (const courtResult of payload.results as Array<Record<string, unknown>>) {
      if (Array.isArray(courtResult.movimentacoes)) {
        const court = (courtResult.tribunal ?? courtResult.court ?? "") as string;
        for (const m of courtResult.movimentacoes as RawMovement[]) {
          items.push({ ...m, tribunal: m.tribunal ?? court });
        }
      }
      if (Array.isArray(courtResult.movements)) {
        const court = (courtResult.tribunal ?? courtResult.court ?? "") as string;
        for (const m of courtResult.movements as RawMovement[]) {
          items.push({ ...m, tribunal: m.tribunal ?? court });
        }
      }
    }
  }

  // If no movements extracted, store entire payload as a single "raw" movement
  if (items.length === 0) {
    results.push({
      tracking_id: trackingId,
      case_id: caseId,
      institution_id: institutionId,
      movement_date: now,
      movement_type: "raw",
      title: "Callback recebido",
      content: "",
      source_court: "",
      raw_payload: JSON.stringify(payload).slice(0, 10000),
      created_at: now,
    });
    return results;
  }

  for (const item of items) {
    results.push({
      tracking_id: trackingId,
      case_id: caseId,
      institution_id: institutionId,
      movement_date: item.date ?? now,
      movement_type: item.tipo ?? item.type ?? "movimentacao",
      title: item.titulo ?? item.title ?? "Movimentação",
      content: item.descricao ?? item.description ?? item.content ?? "",
      source_court: item.tribunal ?? item.court ?? item.source_court ?? "",
      raw_payload: JSON.stringify(item).slice(0, 10000),
      created_at: now,
    });
  }

  return results;
}

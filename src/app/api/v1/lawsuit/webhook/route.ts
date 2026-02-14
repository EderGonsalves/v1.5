import { NextRequest, NextResponse } from "next/server";
import { validateCodiloCallback, getRequestResult } from "@/services/codilo";
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
//
// Codilo sends status change notifications:
//   { action: "requestStatusChanged", requestId: "...", status: "warning" }
//   { action: "requestStatusChanged", requestId: "...", status: "success" }
//
// When status === "success", we fetch the actual results via getRequestResult()
// and extract movements from there.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Validate callback authenticity
  const webhookSecret =
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");
  const userAgent = request.headers.get("user-agent");

  console.log("[lawsuit/webhook] Incoming callback:", {
    hasSecret: !!webhookSecret,
    userAgent,
    caseIdRaw: request.headers.get("x-case-id") || request.nextUrl.searchParams.get("caseId"),
  });

  if (!validateCodiloCallback(webhookSecret, userAgent)) {
    console.warn("[lawsuit/webhook] Invalid callback — rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Extract case ID
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
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as string | undefined;
    const status = body.status as string | undefined;
    const requestId = body.requestId as string | undefined;

    console.log("[lawsuit/webhook] case", caseId, "→", { action, status, requestId });

    // 4. Only process "success" callbacks — ignore "warning" (in progress)
    if (action === "requestStatusChanged" && status !== "success") {
      console.log("[lawsuit/webhook] Ignoring non-success status:", status);
      return NextResponse.json({ ok: true, ignored: true, status });
    }

    // 5. Find active tracking for this case
    const trackings = await getTrackingByCaseId(caseId);
    const tracking = trackings.find((t) => t.is_active === "true");
    if (!tracking) {
      console.warn("[lawsuit/webhook] No active tracking for case", caseId);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 6. Fetch actual results from Codilo using requestId
    let movementItems: RawMovement[] = [];

    if (requestId) {
      try {
        console.log("[lawsuit/webhook] Fetching results for requestId:", requestId);
        const result = await getRequestResult(requestId);
        console.log("[lawsuit/webhook] Codilo result:", JSON.stringify(result).slice(0, 3000));
        movementItems = extractMovementsFromResult(result);
      } catch (err) {
        console.error("[lawsuit/webhook] Error fetching Codilo results:", err);
        // Still try to extract from the callback body itself
      }
    }

    // 7. Fallback: try to extract movements from the callback body directly
    if (movementItems.length === 0) {
      movementItems = extractMovementsFromPayload(body);
    }

    const now = new Date().toISOString();

    // 8. If we still have no movements but got a success, store a status entry
    if (movementItems.length === 0) {
      console.log("[lawsuit/webhook] No movements extracted, storing status entry");
      await createMovement({
        tracking_id: tracking.id,
        case_id: caseId,
        institution_id: tracking.institution_id,
        movement_date: now,
        movement_type: "status",
        title: `Consulta ${status ?? "processada"}`,
        content: requestId ? `RequestId: ${requestId}` : "",
        source_court: "",
        raw_payload: JSON.stringify(body).slice(0, 10000),
        created_at: now,
      });

      await updateTracking(tracking.id, {
        last_update_at: now,
        updated_at: now,
        status: "monitoring",
        error_message: "",
      });

      return NextResponse.json({ ok: true, created: 0, statusOnly: true });
    }

    // 9. Create movements in Baserow
    let createdCount = 0;
    for (const item of movementItems) {
      try {
        await createMovement({
          tracking_id: tracking.id,
          case_id: caseId,
          institution_id: tracking.institution_id,
          movement_date: item.date ?? now,
          movement_type: item.tipo ?? item.type ?? "movimentacao",
          title: item.titulo ?? item.title ?? "Movimentação",
          content: item.descricao ?? item.description ?? item.content ?? "",
          source_court: item.tribunal ?? item.court ?? item.source_court ?? "",
          raw_payload: JSON.stringify(item).slice(0, 10000),
          created_at: now,
        });
        createdCount++;
      } catch (err) {
        console.error("[lawsuit/webhook] Error creating movement:", err);
      }
    }

    // 10. Update tracking stats
    const currentCount = tracking.movements_count || 0;
    await updateTracking(tracking.id, {
      movements_count: currentCount + createdCount,
      last_update_at: now,
      updated_at: now,
      status: "monitoring",
      error_message: "",
    });

    // 11. Update lawsuit_summary on the case
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

    console.log("[lawsuit/webhook] Created", createdCount, "movements for case", caseId);
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
// Helpers
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
  [key: string]: unknown;
};

/**
 * Extract movements from Codilo getRequestResult() response
 */
function extractMovementsFromResult(
  result: { results?: Array<{ court: string; data: unknown }> },
): RawMovement[] {
  const items: RawMovement[] = [];

  if (!result.results || !Array.isArray(result.results)) return items;

  for (const courtResult of result.results) {
    const court = courtResult.court ?? "";
    const data = courtResult.data as Record<string, unknown> | undefined;
    if (!data) continue;

    // Try common Codilo response structures
    const movArrays = [
      data.movimentacoes,
      data.movements,
      data.andamentos,
      data.items,
      data.data,
    ];

    for (const arr of movArrays) {
      if (Array.isArray(arr)) {
        for (const m of arr as RawMovement[]) {
          items.push({ ...m, tribunal: m.tribunal ?? m.court ?? court });
        }
      }
    }

    // If courtResult.data is itself an array
    if (Array.isArray(courtResult.data)) {
      for (const m of courtResult.data as RawMovement[]) {
        items.push({ ...m, tribunal: m.tribunal ?? m.court ?? court });
      }
    }

    // If no nested arrays found, data might have partido/partes/etc — extract what we can
    if (items.length === 0 && data) {
      // Store the entire court data as a single movement for inspection
      items.push({
        date: (data.dataDistribuicao ?? data.data_distribuicao ?? data.date) as string | undefined,
        type: "dados_processo",
        titulo: (data.classe ?? data.assunto ?? data.titulo ?? "Dados do Processo") as string,
        descricao: summarizeProcessData(data),
        tribunal: court,
      });
    }
  }

  return items;
}

/**
 * Extract movements from the raw callback payload body
 */
function extractMovementsFromPayload(payload: Record<string, unknown>): RawMovement[] {
  const items: RawMovement[] = [];

  const arrKeys = ["movimentacoes", "movements", "andamentos", "data", "results", "items"];

  for (const key of arrKeys) {
    const val = payload[key];
    if (Array.isArray(val)) {
      for (const item of val as RawMovement[]) {
        if (typeof item === "object" && item !== null) {
          items.push(item);
        }
      }
      if (items.length > 0) return items;
    }
  }

  // Check nested results
  if (Array.isArray(payload.results)) {
    for (const courtResult of payload.results as Array<Record<string, unknown>>) {
      for (const key of arrKeys) {
        const val = courtResult[key];
        if (Array.isArray(val)) {
          const court = (courtResult.tribunal ?? courtResult.court ?? "") as string;
          for (const m of val as RawMovement[]) {
            items.push({ ...m, tribunal: m.tribunal ?? court });
          }
        }
      }
    }
  }

  return items;
}

/**
 * Summarize process data fields into readable text
 */
function summarizeProcessData(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const fields: Array<[string, string]> = [
    ["classe", "Classe"],
    ["assunto", "Assunto"],
    ["area", "Área"],
    ["status", "Status"],
    ["dataDistribuicao", "Distribuição"],
    ["data_distribuicao", "Distribuição"],
    ["vara", "Vara"],
    ["comarca", "Comarca"],
    ["juiz", "Juiz"],
    ["valor_causa", "Valor da Causa"],
    ["valorCausa", "Valor da Causa"],
  ];

  for (const [key, label] of fields) {
    const val = data[key];
    if (val && typeof val === "string") {
      parts.push(`${label}: ${val}`);
    } else if (val && typeof val === "number") {
      parts.push(`${label}: ${val}`);
    }
  }

  // Parties
  const partes = data.partes ?? data.parties ?? data.polo_ativo ?? data.poloAtivo;
  if (Array.isArray(partes)) {
    const names = partes
      .map((p: Record<string, unknown>) => p.nome ?? p.name ?? "")
      .filter(Boolean)
      .slice(0, 5);
    if (names.length > 0) {
      parts.push(`Partes: ${names.join(", ")}`);
    }
  }

  return parts.join("\n") || JSON.stringify(data).slice(0, 500);
}

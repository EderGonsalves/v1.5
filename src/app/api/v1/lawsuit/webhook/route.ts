import { NextRequest, NextResponse } from "next/server";
import { validateCodiloCallback, getRequestResult } from "@/services/codilo";
import type { CodiloRequestData, CodiloLawsuit } from "@/services/codilo";
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
// Codilo autorequest sends individual callbacks per sub-request:
//   { action: "requestStatusChanged", requestId: "...", status: "warning|success|error" }
//
// On "success": GET /request/{requestId} → { data: [{ cover, properties, people, steps }] }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const webhookSecret =
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");
  const userAgent = request.headers.get("user-agent");

  if (!validateCodiloCallback(webhookSecret, userAgent)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caseIdRaw =
    request.headers.get("x-case-id") ||
    request.nextUrl.searchParams.get("caseId");
  const caseId = Number(caseIdRaw);
  if (!caseId || caseId <= 0) {
    return NextResponse.json({ error: "caseId inválido" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as string | undefined;
    const status = body.status as string | undefined;
    const requestId = body.requestId as string | undefined;

    console.log("[lawsuit/webhook] case", caseId, "→", { action, status, requestId });

    // Ignore non-success callbacks (warning = still processing, error = court unavailable)
    if (action === "requestStatusChanged" && status !== "success") {
      console.log("[lawsuit/webhook] Ignoring status:", status);
      return NextResponse.json({ ok: true, ignored: true, status });
    }

    // Find active tracking
    const trackings = await getTrackingByCaseId(caseId);
    const tracking = trackings.find((t) => t.is_active === "true");
    if (!tracking) {
      console.warn("[lawsuit/webhook] No active tracking for case", caseId);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Fetch full results from Codilo
    if (!requestId) {
      console.warn("[lawsuit/webhook] No requestId in callback");
      return NextResponse.json({ ok: true, noRequestId: true });
    }

    let codiloData: CodiloRequestData;
    try {
      codiloData = await getRequestResult(requestId);
    } catch (err) {
      console.error("[lawsuit/webhook] Failed to fetch results:", err);
      // Store error as movement for visibility
      await createMovement({
        tracking_id: tracking.id,
        case_id: caseId,
        institution_id: tracking.institution_id,
        movement_date: new Date().toISOString(),
        movement_type: "error",
        title: "Erro ao buscar resultado",
        content: err instanceof Error ? err.message : String(err),
        source_court: "",
        raw_payload: JSON.stringify(body).slice(0, 10000),
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, error: "fetch_failed" });
    }

    // Extract movements from Codilo data
    const now = new Date().toISOString();
    const court = codiloData.info?.court ?? codiloData.requested?.court ?? "";
    const platform = codiloData.info?.platform ?? codiloData.requested?.platform ?? "";
    const lawsuits = codiloData.data ?? [];

    let createdCount = 0;

    for (const lawsuit of lawsuits) {
      // Store process info (cover/properties) as one movement
      const processInfo = buildProcessInfo(lawsuit, court, platform);
      if (processInfo) {
        try {
          await createMovement({
            tracking_id: tracking.id,
            case_id: caseId,
            institution_id: tracking.institution_id,
            movement_date: now,
            movement_type: "dados_processo",
            title: processInfo.title,
            content: processInfo.content,
            source_court: court,
            raw_payload: JSON.stringify({ cover: lawsuit.cover, properties: lawsuit.properties, people: lawsuit.people }).slice(0, 10000),
            created_at: now,
          });
          createdCount++;
        } catch (err) {
          console.error("[lawsuit/webhook] Error creating process info:", err);
        }
      }

      // Store each step as a movement
      const steps = lawsuit.steps ?? [];
      console.log("[lawsuit/webhook] Processing", steps.length, "steps from", court);

      for (const step of steps) {
        try {
          await createMovement({
            tracking_id: tracking.id,
            case_id: caseId,
            institution_id: tracking.institution_id,
            movement_date: step.date ?? now,
            movement_type: "movimentacao",
            title: truncate(step.description ?? step.descricao ?? "Movimentação", 200),
            content: step.description ?? step.descricao ?? "",
            source_court: court,
            raw_payload: JSON.stringify(step).slice(0, 10000),
            created_at: now,
          });
          createdCount++;
        } catch (err) {
          console.error("[lawsuit/webhook] Error creating step:", err);
        }
      }
    }

    // If no data at all, store a status-only entry
    if (createdCount === 0) {
      await createMovement({
        tracking_id: tracking.id,
        case_id: caseId,
        institution_id: tracking.institution_id,
        movement_date: now,
        movement_type: "status",
        title: `Consulta ${court || "processada"} — sem movimentações`,
        content: `RequestId: ${requestId}`,
        source_court: court,
        raw_payload: JSON.stringify(codiloData).slice(0, 10000),
        created_at: now,
      });
    }

    // Update tracking
    const currentCount = tracking.movements_count || 0;
    await updateTracking(tracking.id, {
      movements_count: currentCount + createdCount,
      last_update_at: now,
      updated_at: now,
      status: "monitoring",
      error_message: "",
    });

    // Update case summary
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

    console.log("[lawsuit/webhook] Created", createdCount, "entries for case", caseId, "from", court);
    return NextResponse.json({ ok: true, created: createdCount });
  } catch (err) {
    console.error("[lawsuit/webhook] Error:", err);
    return NextResponse.json({ error: "Erro ao processar callback" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProcessInfo(
  lawsuit: CodiloLawsuit,
  court: string,
  platform: string,
): { title: string; content: string } | null {
  const cover = lawsuit.cover ?? {};
  const props = lawsuit.properties ?? {};
  const people = lawsuit.people ?? [];

  const parts: string[] = [];

  // Cover fields (key-value pairs like "Classe", "Assunto", "Foro", "Juiz")
  for (const [key, value] of Object.entries(cover)) {
    if (value && typeof value === "string") {
      parts.push(`${key}: ${value}`);
    }
  }

  // Properties
  const propFields = ["classe", "class", "assunto", "subject", "area", "vara", "comarca", "juiz", "status", "valor"];
  for (const field of propFields) {
    const val = props[field];
    if (val && typeof val === "string" && !parts.some((p) => p.toLowerCase().includes(field))) {
      parts.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${val}`);
    }
  }

  // People
  if (people.length > 0) {
    const activeParty = people.filter((p) => (p.pole ?? p.polo) === "active" || (p.pole ?? p.polo) === "ativo");
    const passiveParty = people.filter((p) => (p.pole ?? p.polo) === "passive" || (p.pole ?? p.polo) === "passivo");

    if (activeParty.length > 0) {
      parts.push(`Polo Ativo: ${activeParty.map((p) => p.name ?? p.nome ?? "").filter(Boolean).join(", ")}`);
    }
    if (passiveParty.length > 0) {
      parts.push(`Polo Passivo: ${passiveParty.map((p) => p.name ?? p.nome ?? "").filter(Boolean).join(", ")}`);
    }
  }

  if (parts.length === 0) return null;

  const title = `Dados do Processo — ${court} (${platform})`;
  return { title, content: parts.join("\n") };
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

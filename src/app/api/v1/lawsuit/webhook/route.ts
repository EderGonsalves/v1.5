import { NextRequest, NextResponse } from "next/server";
import { validateCodiloCallback, getRequestResult } from "@/services/codilo";
import type { CodiloLawsuit } from "@/services/codilo";
import {
  getTrackingByCaseId,
  createMovement,
  updateTracking,
  getMovementsByTrackingId,
  buildLawsuitSummary,
} from "@/services/lawsuit";
import { updateBaserowCase } from "@/services/api";

// ---------------------------------------------------------------------------
// POST /api/v1/lawsuit/webhook — Codilo callback (CSRF exempt)
//
// Handles TWO callback formats:
//
// 1. CAPTURE API (autorequest / consulta avulsa):
//    { action: "requestStatusChanged", requestId: "...", status: "success" }
//    → On success: GET /request/{requestId} to fetch full data
//
// 2. PUSH API (monitoramento diário):
//    { id, cnj, info: [{ data: [{ cover, properties, people, steps }] }] }
//    → Data included directly in callback payload
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

    // Detect callback type
    const isPushCallback = Array.isArray(body.info) && !!body.cnj;
    const isCaptureCallback = action === "requestStatusChanged";

    console.log("[lawsuit/webhook] case", caseId, "→", {
      type: isPushCallback ? "push" : isCaptureCallback ? "capture" : "unknown",
      action, status, requestId,
      cnj: body.cnj,
    });

    // Capture API: ignore non-success (warning = processing, error = court down)
    if (isCaptureCallback && status !== "success") {
      console.log("[lawsuit/webhook] Ignoring capture status:", status);
      return NextResponse.json({ ok: true, ignored: true, status });
    }

    // Find active tracking
    const trackings = await getTrackingByCaseId(caseId);
    const tracking = trackings.find((t) => t.is_active === "true");
    if (!tracking) {
      console.warn("[lawsuit/webhook] No active tracking for case", caseId);
      return NextResponse.json({ ok: true, skipped: true });
    }

    const now = new Date().toISOString();
    let lawsuits: CodiloLawsuit[] = [];
    let court = "";
    let platform = "";

    if (isPushCallback) {
      // ---- PUSH API: data is in body.info[].data[] ----
      const infoArray = body.info as Array<Record<string, unknown>>;
      for (const info of infoArray) {
        const infoCourt = (info.searchTag ?? info.search ?? "") as string;
        const infoPlatform = (info.platformTag ?? info.platform ?? "") as string;
        court = court || infoCourt;
        platform = platform || infoPlatform;

        const dataArray = info.data as CodiloLawsuit[] | undefined;
        if (Array.isArray(dataArray)) {
          for (const item of dataArray) {
            lawsuits.push({ ...item, _court: infoCourt, _platform: infoPlatform } as CodiloLawsuit & Record<string, unknown>);
          }
        }
      }
      console.log("[lawsuit/webhook] Push callback:", { courts: infoArray.length, lawsuits: lawsuits.length });

    } else if (isCaptureCallback && requestId) {
      // ---- CAPTURE API: fetch data via GET /request/{requestId} ----
      try {
        const codiloData = await getRequestResult(requestId);
        court = codiloData.info?.court ?? codiloData.requested?.court ?? "";
        platform = codiloData.info?.platform ?? codiloData.requested?.platform ?? "";
        lawsuits = codiloData.data ?? [];
      } catch (err) {
        console.error("[lawsuit/webhook] Failed to fetch results:", err);
        await createMovement({
          tracking_id: tracking.id,
          case_id: caseId,
          institution_id: tracking.institution_id,
          movement_date: now,
          movement_type: "error",
          title: "Erro ao buscar resultado",
          content: err instanceof Error ? err.message : String(err),
          source_court: "",
          raw_payload: JSON.stringify(body).slice(0, 10000),
          created_at: now,
        });
        return NextResponse.json({ ok: true, error: "fetch_failed" });
      }
    } else {
      console.warn("[lawsuit/webhook] Unknown callback format, storing raw");
      await createMovement({
        tracking_id: tracking.id,
        case_id: caseId,
        institution_id: tracking.institution_id,
        movement_date: now,
        movement_type: "raw",
        title: "Callback desconhecido",
        content: "",
        source_court: "",
        raw_payload: JSON.stringify(body).slice(0, 10000),
        created_at: now,
      });
      return NextResponse.json({ ok: true, unknownFormat: true });
    }

    // ---- Process lawsuits ----
    let createdCount = 0;

    for (const lawsuit of lawsuits) {
      const lCourt = (lawsuit as Record<string, unknown>)._court as string ?? court;
      const lPlatform = (lawsuit as Record<string, unknown>)._platform as string ?? platform;

      // Store process info (cover/properties/people)
      const processInfo = buildProcessInfo(lawsuit, lCourt, lPlatform);
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
            source_court: lCourt,
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
      console.log("[lawsuit/webhook] Processing", steps.length, "steps from", lCourt);

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
            source_court: lCourt,
            raw_payload: JSON.stringify(step).slice(0, 10000),
            created_at: now,
          });
          createdCount++;
        } catch (err) {
          console.error("[lawsuit/webhook] Error creating step:", err);
        }
      }
    }

    // If no data, store status entry
    if (createdCount === 0) {
      await createMovement({
        tracking_id: tracking.id,
        case_id: caseId,
        institution_id: tracking.institution_id,
        movement_date: now,
        movement_type: "status",
        title: `Consulta ${court || "processada"} — sem movimentações`,
        content: requestId ? `RequestId: ${requestId}` : "",
        source_court: court,
        raw_payload: JSON.stringify(isPushCallback ? body : {}).slice(0, 10000),
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

      await updateBaserowCase(caseId, {
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

  for (const [key, value] of Object.entries(cover)) {
    if (value && typeof value === "string") {
      parts.push(`${key}: ${value}`);
    }
  }

  const propFields = ["classe", "class", "assunto", "subject", "area", "vara", "comarca", "juiz", "status", "valor"];
  for (const field of propFields) {
    const val = props[field];
    if (val && typeof val === "string" && !parts.some((p) => p.toLowerCase().includes(field))) {
      parts.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${val}`);
    }
  }

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

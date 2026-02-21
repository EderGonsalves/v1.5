import { NextRequest, NextResponse } from "next/server";
import { validateRiaSignWebhook } from "@/services/riasign";
import {
  getEnvelopeByRiaId,
  updateEnvelopeRecord,
} from "@/services/sign-envelopes";
import { baserowPatch } from "@/services/api";
import type { RiaSignWebhookEvent, SignerInfo } from "@/lib/documents/types";

const BASEROW_API_URL = process.env.BASEROW_API_URL ?? "";
const CASES_TABLE_ID = process.env.BASEROW_CASES_TABLE_ID ?? "225";

// Event → status mapping
const STATUS_MAP: Record<string, string> = {
  "envelope.sent": "sent",
  "signer.viewed": "viewed",
  "signer.signed": "signed",
  "signer.declined": "declined",
  "envelope.completed": "completed",
  "envelope.expired": "expired",
};

// POST /api/v1/sign/webhook — receive RIA Sign events (no auth cookie)
export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body for HMAC validation
    const rawBody = await request.text();
    const signature = request.headers.get("x-riasign-signature");

    const isValid = await validateRiaSignWebhook(rawBody, signature);
    if (!isValid) {
      console.warn("[sign/webhook] Assinatura HMAC inválida — rejeitando");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse event
    const event = JSON.parse(rawBody) as RiaSignWebhookEvent;
    const { event: eventType, envelope_id, timestamp, data } = event;

    console.log(
      `[sign/webhook] Evento recebido: ${eventType} | envelope=${envelope_id} | timestamp=${timestamp} | signer=${data?.signer?.name ?? "n/a"}`,
    );

    // 3. Find our record in Baserow
    const record = await getEnvelopeByRiaId(envelope_id);
    if (!record) {
      console.warn("[sign/webhook] Unknown envelope_id:", envelope_id);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 4. Map event to status and update
    const newStatus = STATUS_MAP[eventType];
    if (newStatus) {
      const updates: Record<string, unknown> = { status: newStatus };

      if (
        newStatus === "signed" ||
        newStatus === "completed"
      ) {
        updates.signed_at = data.signer?.signed_at || timestamp;
      }

      // 4b. Atualizar status do signatário individual no signers_json
      if (data.signer && record.signers_json) {
        try {
          const signers = JSON.parse(record.signers_json) as SignerInfo[];
          const signerName = data.signer.name?.toLowerCase();
          const signerPhone = data.signer.phone;
          const idx = signers.findIndex(
            (s) =>
              s.name.toLowerCase() === signerName ||
              (signerPhone && s.phone === signerPhone),
          );
          if (idx >= 0) {
            signers[idx].status = newStatus;
            updates.signers_json = JSON.stringify(signers);
          }
        } catch {
          // signers_json malformado — ignora
        }
      }

      await updateEnvelopeRecord(record.id, updates);

      // Also update the case
      try {
        const caseUrl = `${BASEROW_API_URL}/database/rows/table/${CASES_TABLE_ID}/${record.case_id}/?user_field_names=true`;
        await baserowPatch(caseUrl, { sign_status: newStatus });
      } catch (caseErr) {
        console.error("[sign/webhook] Case update failed:", caseErr);
      }
    }

    // 5. On completion, send push notification (fire-and-forget)
    if (eventType === "envelope.completed") {
      sendCompletionNotification(record).catch((err) =>
        console.error("[sign/webhook] Push error:", err),
      );
    }

    return NextResponse.json({ ok: true, event: eventType, newStatus });
  } catch (err) {
    console.error("[sign/webhook] Error:", err);
    // Return 200 to prevent RIA Sign from retrying on parse errors
    return NextResponse.json({ ok: false, error: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// Push notification helper
// ---------------------------------------------------------------------------

async function sendCompletionNotification(
  record: import("@/lib/documents/types").SignEnvelopeRow,
): Promise<void> {
  try {
    // Dynamic import to avoid bundling push service when not needed
    const { getSubscriptionsByInstitution, sendPushToSubscriptions } =
      await import("@/services/push");

    const subs = await getSubscriptionsByInstitution(record.institution_id);
    if (subs.length > 0) {
      await sendPushToSubscriptions(subs, {
        title: "Documento Assinado",
        body: `${record.signer_name} assinou "${record.subject}"`,
        url: "/casos",
        icon: "/icons/icon-192x192.png",
        tag: `sign-completed-${record.id}`,
      });
    }
  } catch (err) {
    console.error("[sign/webhook] Push notification error:", err);
  }
}

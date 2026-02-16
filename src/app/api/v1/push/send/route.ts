import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";
import {
  getAllSubscriptions,
  getSubscriptionsByInstitution,
  sendPushToSubscriptions,
  createNotificationRecord,
} from "@/services/push";

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const body = await request.json();
  const { title, body: msgBody, url = "/casos", institution_id } = body;

  if (!title || !msgBody) {
    return NextResponse.json(
      { error: "Título e mensagem são obrigatórios" },
      { status: 400 },
    );
  }

  // Get subscriptions
  const subscriptions =
    institution_id && institution_id > 0
      ? await getSubscriptionsByInstitution(institution_id)
      : await getAllSubscriptions();

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "Nenhum dispositivo inscrito encontrado" },
      { status: 404 },
    );
  }

  // Send push
  const result = await sendPushToSubscriptions(subscriptions, {
    title,
    body: msgBody,
    url,
    icon: "/icons/icon-192x192.png",
  });

  // Determine status
  let status: string;
  if (result.failed === 0) status = "sent";
  else if (result.sent === 0) status = "failed";
  else status = "partial_failure";

  // Save history record
  await createNotificationRecord({
    title,
    body: msgBody,
    url,
    icon: "/icons/icon-192x192.png",
    institution_id: institution_id || 0,
    sent_by_email: (auth.payload?.email as string) || "",
    sent_by_name: (auth.payload?.name as string) || "",
    recipients_count: result.sent,
    status,
    error_log: result.errors.length > 0 ? result.errors.join("\n") : "",
  });

  return NextResponse.json({ sent: result.sent, failed: result.failed });
}

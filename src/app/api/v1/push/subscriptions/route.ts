import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/services/departments";
import { getAllSubscriptions } from "@/services/push";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!isGlobalAdmin(auth.institutionId)) {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const subs = await getAllSubscriptions();

  const enriched = subs.map((s) => ({
    id: s.id,
    user_email: s.user_email,
    user_name: s.user_name,
    legacy_user_id: s.legacy_user_id,
    institution_id: s.institution_id,
    endpoint_type: s.endpoint.includes("/fcm/send/") ? "LEGACY" : "VAPID",
    endpoint_preview: s.endpoint.slice(0, 80) + "...",
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));

  const legacyCount = enriched.filter((s) => s.endpoint_type === "LEGACY").length;
  const vapidCount = enriched.filter((s) => s.endpoint_type === "VAPID").length;

  return NextResponse.json({
    total: subs.length,
    legacy: legacyCount,
    vapid: vapidCount,
    subscriptions: enriched,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { saveSubscription, removeSubscription } from "@/services/push";

// POST — subscribe
export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Dados de subscription inválidos" },
      { status: 400 },
    );
  }

  const record = await saveSubscription({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_email: (auth.payload?.email as string) || "",
    user_name: (auth.payload?.name as string) || "",
    legacy_user_id: auth.legacyUserId || "",
    institution_id: auth.institutionId,
    user_agent: request.headers.get("user-agent") || "",
  });

  return NextResponse.json({ ok: true, id: record.id });
}

// DELETE — unsubscribe
export async function DELETE(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint obrigatório" }, { status: 400 });
  }

  const removed = await removeSubscription(endpoint);
  return NextResponse.json({ ok: true, removed });
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getTrackingById, updateTracking } from "@/services/lawsuit";

type RouteParams = { trackingId: string };
type RouteContext = { params: RouteParams | Promise<RouteParams> };

// ---------------------------------------------------------------------------
// PATCH /api/v1/lawsuit/[trackingId] — Toggle active / update
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { trackingId } = await Promise.resolve(context.params);
    const id = Number(trackingId);
    if (!id || id <= 0) {
      return NextResponse.json({ error: "trackingId inválido" }, { status: 400 });
    }

    const existing = await getTrackingById(id);
    if (!existing) {
      return NextResponse.json({ error: "Acompanhamento não encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.is_active === "string") {
      updates.is_active = body.is_active;
      updates.status = body.is_active === "true" ? "monitoring" : "stopped";
    }

    updates.updated_at = new Date().toISOString();

    const updated = await updateTracking(id, updates);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[lawsuit] Erro ao atualizar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/lawsuit/[trackingId] — Soft-delete (stop monitoring)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { trackingId } = await Promise.resolve(context.params);
    const id = Number(trackingId);
    if (!id || id <= 0) {
      return NextResponse.json({ error: "trackingId inválido" }, { status: 400 });
    }

    const existing = await getTrackingById(id);
    if (!existing) {
      return NextResponse.json({ error: "Acompanhamento não encontrado" }, { status: 404 });
    }

    await updateTracking(id, {
      is_active: "false",
      status: "stopped",
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lawsuit] Erro ao deletar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao remover" },
      { status: 500 },
    );
  }
}

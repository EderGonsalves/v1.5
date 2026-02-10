import { NextRequest, NextResponse } from "next/server";
import { fetchTicketById, updateTicket } from "@/services/support";
import { notifySupportWebhook } from "@/services/support-notify";
import { getRequestAuth } from "@/lib/auth/session";

const SYSADMIN_INSTITUTION_ID = 4;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (auth.institutionId !== SYSADMIN_INSTITUTION_ID) {
    return NextResponse.json(
      { error: "Apenas o sysAdmin pode editar chamados" },
      { status: 403 },
    );
  }

  const { ticketId } = await params;
  const id = Number(ticketId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // Fetch current ticket to detect changes
    const previous = await fetchTicketById(id);
    if (!previous) {
      return NextResponse.json(
        { error: "Chamado não encontrado" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { status, sector, assigned_to } = body as {
      status?: string;
      sector?: string;
      assigned_to?: string;
    };

    if (status) {
      const validStatus = ["aberto", "em_andamento", "concluido"];
      if (!validStatus.includes(status)) {
        return NextResponse.json(
          { error: "Status inválido" },
          { status: 400 },
        );
      }
    }

    const ticket = await updateTicket(id, { status, sector, assigned_to });

    // Notify webhook for each changed field
    if (status && status !== previous.status) {
      notifySupportWebhook({
        type: "status_update",
        ticket,
        previous_value: previous.status,
        new_value: status,
      }).catch((e) => console.error("Webhook error:", e));
    }

    if (sector && sector !== previous.sector) {
      notifySupportWebhook({
        type: "sector_update",
        ticket,
        previous_value: previous.sector,
        new_value: sector,
      }).catch((e) => console.error("Webhook error:", e));
    }

    if (assigned_to !== undefined && assigned_to !== previous.assigned_to) {
      notifySupportWebhook({
        type: "transfer",
        ticket,
        previous_value: previous.assigned_to,
        new_value: assigned_to,
      }).catch((e) => console.error("Webhook error:", e));
    }

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error("Erro ao atualizar ticket:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar chamado" },
      { status: 500 },
    );
  }
}

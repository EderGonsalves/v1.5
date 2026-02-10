import { NextRequest, NextResponse } from "next/server";
import {
  fetchTicketById,
  fetchTicketMessages,
  createTicketMessage,
} from "@/services/support";
import { notifySupportWebhook } from "@/services/support-notify";
import { getRequestAuth } from "@/lib/auth/session";
import { fetchInstitutionUsers } from "@/services/permissions";

const SYSADMIN_INSTITUTION_ID = 4;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { ticketId } = await params;
  const id = Number(ticketId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const ticket = await fetchTicketById(id);
    if (!ticket) {
      return NextResponse.json(
        { error: "Chamado não encontrado" },
        { status: 404 },
      );
    }

    // Check access: owner institution or sysAdmin
    const isSysAdmin = auth.institutionId === SYSADMIN_INSTITUTION_ID;
    if (!isSysAdmin && String(ticket.institution_id) !== String(auth.institutionId)) {
      return NextResponse.json(
        { error: "Sem permissão para acessar este chamado" },
        { status: 403 },
      );
    }

    const messages = await fetchTicketMessages(id);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Erro ao buscar mensagens:", err);
    return NextResponse.json(
      { error: "Erro ao buscar mensagens" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { ticketId } = await params;
  const id = Number(ticketId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const ticket = await fetchTicketById(id);
    if (!ticket) {
      return NextResponse.json(
        { error: "Chamado não encontrado" },
        { status: 404 },
      );
    }

    const isSysAdmin = auth.institutionId === SYSADMIN_INSTITUTION_ID;
    if (!isSysAdmin && String(ticket.institution_id) !== String(auth.institutionId)) {
      return NextResponse.json(
        { error: "Sem permissão para acessar este chamado" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { content } = body as { content?: string };
    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Conteúdo da mensagem é obrigatório" },
        { status: 400 },
      );
    }

    const authorRole = isSysAdmin ? "support" : "user";

    // Fetch user info (name, email, phone) from users table
    let authorName = "";
    let authorEmail = "";
    let authorPhone = "";
    try {
      const users = await fetchInstitutionUsers(auth.institutionId);
      const legacyId = auth.legacyUserId ?? "";
      const payloadEmail = (auth.payload?.email as string) ?? "";

      const matchedUser = users.find((u) => {
        const uEmail = u.email.toLowerCase();
        // Match by payload email
        if (payloadEmail && uEmail === payloadEmail.toLowerCase()) return true;
        // legacyUserId can be the login email (webhook auth) or a numeric id (users table auth)
        if (legacyId && uEmail === legacyId.toLowerCase()) return true;
        if (legacyId && String(u.id) === legacyId) return true;
        return false;
      });
      if (matchedUser) {
        authorName = matchedUser.name;
        authorEmail = matchedUser.email;
        authorPhone = matchedUser.phone;
      }
    } catch (err) {
      console.error("Erro ao buscar usuário:", err);
    }

    const message = await createTicketMessage({
      ticket_id: id,
      institution_id: auth.institutionId,
      author_name: authorName,
      author_email: authorEmail,
      author_phone: authorPhone,
      author_role: authorRole,
      content: content.trim(),
    });

    // Notify webhook (fire-and-forget)
    notifySupportWebhook({
      type: isSysAdmin ? "support_reply" : "client_reply",
      ticket,
      message: content.trim(),
    }).catch((e) => console.error("Webhook fire-and-forget error:", e));

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar mensagem:", err);
    return NextResponse.json(
      { error: "Erro ao criar mensagem" },
      { status: 500 },
    );
  }
}

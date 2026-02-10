import { NextRequest, NextResponse } from "next/server";
import {
  fetchTickets,
  createTicket,
  createTicketMessage,
  type CreateTicketData,
} from "@/services/support";
import { notifySupportWebhook } from "@/services/support-notify";
import { getRequestAuth } from "@/lib/auth/session";
import { fetchInstitutionUsers } from "@/services/permissions";

const SYSADMIN_INSTITUTION_ID = 4;

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const isSysAdmin = auth.institutionId === SYSADMIN_INSTITUTION_ID;
    const tickets = await fetchTickets(
      isSysAdmin ? undefined : auth.institutionId,
    );
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("Erro ao buscar tickets:", err);
    return NextResponse.json(
      { error: "Erro ao buscar chamados" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { category, subject, description } = body as {
      category?: string;
      subject?: string;
      description?: string;
    };

    if (!category || !subject || !description) {
      return NextResponse.json(
        { error: "Campos obrigatórios: category, subject, description" },
        { status: 400 },
      );
    }

    const validCategories = ["sistema", "ia", "financeiro"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Categoria inválida" },
        { status: 400 },
      );
    }

    // Fetch user info (name, email, phone) from users table
    let userName = "";
    let userEmail = "";
    let userPhone = "";
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
        userName = matchedUser.name;
        userEmail = matchedUser.email;
        userPhone = matchedUser.phone;
      }
    } catch (err) {
      console.error("Erro ao buscar usuário:", err);
    }

    const data: CreateTicketData = {
      institution_id: auth.institutionId,
      created_by_name: userName,
      created_by_email: userEmail,
      created_by_phone: userPhone,
      category,
      subject: subject.trim(),
      description: description.trim(),
    };

    const ticket = await createTicket(data);

    // Create initial message from the description so it shows in the conversation
    await createTicketMessage({
      ticket_id: ticket.id,
      institution_id: auth.institutionId,
      author_name: userName,
      author_email: userEmail,
      author_phone: userPhone,
      author_role: "user",
      content: description.trim(),
    });

    // Notify webhook (fire-and-forget)
    notifySupportWebhook({
      type: "new_ticket",
      ticket,
    }).catch((e) => console.error("Webhook fire-and-forget error:", e));

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar ticket:", err);
    return NextResponse.json(
      { error: "Erro ao criar chamado" },
      { status: 500 },
    );
  }
}

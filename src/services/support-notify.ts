import type { SupportTicketRow } from "@/services/support";

const SUPPORT_WEBHOOK_URL =
  "https://automation-webhook.riasistemas.com.br/webhook/v2-suporte";

export type SupportWebhookType =
  | "new_ticket"
  | "client_reply"
  | "support_reply"
  | "status_update"
  | "sector_update"
  | "transfer";

type SupportNotifyPayload = {
  type: SupportWebhookType;
  ticket: {
    id: number;
    protocol: string;
    institution_id: number;
    created_by_name: string;
    created_by_email: string;
    created_by_phone: string;
    category: string;
    subject: string;
    status: string;
    sector: string;
    assigned_to: string;
  };
  message?: string;
  previous_value?: string;
  new_value?: string;
  timestamp: string;
};

/**
 * Notifica o webhook de suporte. Fire-and-forget — nunca lança erro.
 */
export async function notifySupportWebhook(params: {
  type: SupportWebhookType;
  ticket: SupportTicketRow;
  message?: string;
  previous_value?: string;
  new_value?: string;
}): Promise<void> {
  const { type, ticket, message, previous_value, new_value } = params;

  const payload: SupportNotifyPayload = {
    type,
    ticket: {
      id: ticket.id,
      protocol: ticket.protocol,
      institution_id: ticket.institution_id,
      created_by_name: ticket.created_by_name,
      created_by_email: ticket.created_by_email,
      created_by_phone: ticket.created_by_phone,
      category: ticket.category,
      subject: ticket.subject,
      status: ticket.status,
      sector: ticket.sector,
      assigned_to: ticket.assigned_to,
    },
    message,
    previous_value,
    new_value,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(SUPPORT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Erro ao notificar webhook de suporte:", err);
  }
}

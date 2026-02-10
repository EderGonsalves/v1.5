import type {
  SupportTicketRow,
  SupportMessageRow,
  SupportKBRow,
  UpdateTicketData,
} from "@/services/support";

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function fetchTicketsClient(): Promise<SupportTicketRow[]> {
  const res = await fetch("/api/v1/support/tickets");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.tickets ?? [];
}

export async function createTicketClient(data: {
  category: string;
  subject: string;
  description: string;
}): Promise<SupportTicketRow> {
  const res = await fetch("/api/v1/support/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const result = await res.json();
  return result.ticket;
}

export async function updateTicketClient(
  ticketId: number,
  data: UpdateTicketData,
): Promise<SupportTicketRow> {
  const res = await fetch(`/api/v1/support/tickets/${ticketId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const result = await res.json();
  return result.ticket;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function fetchTicketMessagesClient(
  ticketId: number,
): Promise<SupportMessageRow[]> {
  const res = await fetch(`/api/v1/support/tickets/${ticketId}/messages`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.messages ?? [];
}

export async function createTicketMessageClient(
  ticketId: number,
  data: { content: string },
): Promise<SupportMessageRow> {
  const res = await fetch(`/api/v1/support/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const result = await res.json();
  return result.message;
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export async function searchKBClient(
  query: string,
): Promise<SupportKBRow[]> {
  const res = await fetch(
    `/api/v1/support/kb?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body?.error as string) || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.articles ?? [];
}

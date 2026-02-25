import axios from "axios";
import { eq, desc, sql, or, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema/supportTickets";
import { supportMessages } from "@/lib/db/schema/supportMessages";
import { supportKb } from "@/lib/db/schema/supportKb";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";

// ---------------------------------------------------------------------------
// Baserow config (fallback)
// ---------------------------------------------------------------------------

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ?? process.env.NEXT_PUBLIC_BASEROW_API_URL;
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ?? process.env.NEXT_PUBLIC_BASEROW_API_KEY;

const DEFAULT_TABLES = {
  tickets: 243,
  messages: 244,
  kb: 245,
};

const TABLE_IDS = {
  tickets:
    Number(
      process.env.BASEROW_SUPPORT_TICKETS_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_SUPPORT_TICKETS_TABLE_ID ??
        DEFAULT_TABLES.tickets,
    ) || DEFAULT_TABLES.tickets,
  messages:
    Number(
      process.env.BASEROW_SUPPORT_MESSAGES_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_SUPPORT_MESSAGES_TABLE_ID ??
        DEFAULT_TABLES.messages,
    ) || DEFAULT_TABLES.messages,
  kb:
    Number(
      process.env.BASEROW_SUPPORT_KB_TABLE_ID ??
        process.env.NEXT_PUBLIC_BASEROW_SUPPORT_KB_TABLE_ID ??
        DEFAULT_TABLES.kb,
    ) || DEFAULT_TABLES.kb,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportTicketRow = {
  id: number;
  protocol: string;
  institution_id: number;
  created_by_name: string;
  created_by_email: string;
  created_by_phone: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  sector: string;
  assigned_to: string;
  department_id?: number | null;
  department_name?: string | null;
  assigned_to_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SupportMessageRow = {
  id: number;
  ticket_id: number;
  institution_id: number;
  author_name: string;
  author_email: string;
  author_phone: string;
  author_role: string;
  content: string;
  created_at: string;
};

export type SupportKBRow = {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string;
  created_at: string;
};

export type CreateTicketData = {
  institution_id: number;
  created_by_name: string;
  created_by_email: string;
  created_by_phone: string;
  category: string;
  subject: string;
  description: string;
};

export type UpdateTicketData = {
  status?: string;
  sector?: string;
  assigned_to?: string;
  department_id?: number | null;
  department_name?: string | null;
  assigned_to_user_id?: number | null;
};

export type CreateMessageData = {
  ticket_id: number;
  institution_id: number;
  author_name: string;
  author_email: string;
  author_phone: string;
  author_role: "user" | "support";
  content: string;
};

// ---------------------------------------------------------------------------
// Drizzle mappers
// ---------------------------------------------------------------------------

function mapTicketRow(r: typeof supportTickets.$inferSelect): SupportTicketRow {
  return {
    id: r.id,
    protocol: r.protocol || "",
    institution_id: Number(r.institutionId) || 0,
    created_by_name: r.createdByName || "",
    created_by_email: r.createdByEmail || "",
    created_by_phone: r.createdByPhone || "",
    category: r.category || "",
    subject: r.subject || "",
    description: r.description || "",
    status: r.status || "",
    sector: r.sector || "",
    assigned_to: r.assignedTo || "",
    department_id: r.departmentId ? Number(r.departmentId) : null,
    department_name: r.departmentName || null,
    assigned_to_user_id: r.assignedToUserId ? Number(r.assignedToUserId) : null,
    created_at: r.createdAt || "",
    updated_at: r.updatedAt || "",
  };
}

function mapMessageRow(r: typeof supportMessages.$inferSelect): SupportMessageRow {
  return {
    id: r.id,
    ticket_id: Number(r.ticketId) || 0,
    institution_id: Number(r.institutionId) || 0,
    author_name: r.authorName || "",
    author_email: r.authorEmail || "",
    author_phone: r.authorPhone || "",
    author_role: r.authorRole || "",
    content: r.content || "",
    created_at: r.createdAt || "",
  };
}

function mapKbRow(r: typeof supportKb.$inferSelect): SupportKBRow {
  return {
    id: r.id,
    title: r.title || "",
    content: r.content || "",
    category: r.category || "",
    tags: r.tags || "",
    created_at: r.createdAt || "",
  };
}

// ---------------------------------------------------------------------------
// Baserow helpers (fallback)
// ---------------------------------------------------------------------------

type BaserowListResponse<T> = { results?: T[] };

const ensureEnv = () => {
  if (!BASEROW_API_URL) throw new Error("BASEROW_API_URL não configurado");
  if (!BASEROW_API_KEY) throw new Error("BASEROW_API_KEY não configurado");
};

const baserowClient = () => {
  ensureEnv();
  return axios.create({
    baseURL: BASEROW_API_URL,
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
};

const fetchTableRows = async <T>(
  tableId: number,
  params?: URLSearchParams,
): Promise<T[]> => {
  const client = baserowClient();
  const searchParams = params ?? new URLSearchParams();
  if (!searchParams.has("user_field_names")) {
    searchParams.set("user_field_names", "true");
  }
  const url = `/database/rows/table/${tableId}/?${searchParams.toString()}`;
  const response = await client.get<BaserowListResponse<T>>(url);
  return response.data.results ?? [];
};

const createRow = async <T>(
  tableId: number,
  payload: Record<string, unknown>,
) => {
  const client = baserowClient();
  const url = `/database/rows/table/${tableId}/?user_field_names=true`;
  const response = await client.post<T>(url, payload);
  return response.data;
};

const updateRow = async <T>(
  tableId: number,
  rowId: number,
  payload: Record<string, unknown>,
) => {
  const client = baserowClient();
  const url = `/database/rows/table/${tableId}/${rowId}/?user_field_names=true`;
  const response = await client.patch<T>(url, payload);
  return response.data;
};

// ---------------------------------------------------------------------------
// Protocol generation — SUP-YYYYMMDD-XXXX (hex)
// ---------------------------------------------------------------------------

export function generateProtocol(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `SUP-${date}-${hex}`;
}

// ---------------------------------------------------------------------------
// Tickets CRUD
// ---------------------------------------------------------------------------

export async function fetchTickets(
  institutionId?: number,
): Promise<SupportTicketRow[]> {
  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const condition = institutionId
        ? eq(supportTickets.institutionId, String(institutionId))
        : undefined;
      const rows = await db
        .select()
        .from(supportTickets)
        .where(condition)
        .orderBy(desc(supportTickets.id));
      return rows.map(mapTicketRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  if (institutionId) {
    params.append("filter__institution_id__equal", String(institutionId));
  }
  const rows = await fetchTableRows<SupportTicketRow>(TABLE_IDS.tickets, params);
  return rows.sort((a, b) => b.id - a.id);
}

export async function fetchTicketById(
  ticketId: number,
): Promise<SupportTicketRow | null> {
  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const [row] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      return row ? mapTicketRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  try {
    const client = baserowClient();
    const url = `/database/rows/table/${TABLE_IDS.tickets}/${ticketId}/?user_field_names=true`;
    const response = await client.get<SupportTicketRow>(url);
    return response.data;
  } catch {
    return null;
  }
}

export async function createTicket(
  data: CreateTicketData,
): Promise<SupportTicketRow> {
  const now = new Date().toISOString();
  const protocol = generateProtocol();
  const sector = categoryToSector(data.category);

  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(supportTickets)
        .values({
          protocol,
          institutionId: String(data.institution_id),
          createdByName: data.created_by_name,
          createdByEmail: data.created_by_email,
          createdByPhone: data.created_by_phone,
          category: data.category,
          subject: data.subject,
          description: data.description,
          status: "aberto",
          sector,
          assignedTo: sector,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapTicketRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const payload: Record<string, unknown> = {
    protocol,
    institution_id: data.institution_id,
    created_by_name: data.created_by_name,
    created_by_email: data.created_by_email,
    created_by_phone: data.created_by_phone,
    category: data.category,
    subject: data.subject,
    description: data.description,
    status: "aberto",
    sector,
    assigned_to: sector,
    created_at: now,
    updated_at: now,
  };
  return createRow<SupportTicketRow>(TABLE_IDS.tickets, payload);
}

export async function updateTicket(
  ticketId: number,
  data: UpdateTicketData,
): Promise<SupportTicketRow> {
  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const setValues: Partial<typeof supportTickets.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (data.status !== undefined) setValues.status = data.status;
      if (data.sector !== undefined) setValues.sector = data.sector;
      if (data.assigned_to !== undefined) setValues.assignedTo = data.assigned_to;
      if (data.department_id !== undefined)
        setValues.departmentId = data.department_id != null ? String(data.department_id) : null;
      if (data.department_name !== undefined)
        setValues.departmentName = data.department_name;
      if (data.assigned_to_user_id !== undefined)
        setValues.assignedToUserId = data.assigned_to_user_id != null ? String(data.assigned_to_user_id) : null;
  
      const [updated] = await db
        .update(supportTickets)
        .set(setValues)
        .where(eq(supportTickets.id, ticketId))
        .returning();
      return mapTicketRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.status !== undefined) payload.status = data.status;
  if (data.sector !== undefined) payload.sector = data.sector;
  if (data.assigned_to !== undefined) payload.assigned_to = data.assigned_to;
  if (data.department_id !== undefined) payload.department_id = data.department_id;
  if (data.department_name !== undefined) payload.department_name = data.department_name;
  if (data.assigned_to_user_id !== undefined) payload.assigned_to_user_id = data.assigned_to_user_id;
  return updateRow<SupportTicketRow>(TABLE_IDS.tickets, ticketId, payload);
}

// ---------------------------------------------------------------------------
// Messages CRUD
// ---------------------------------------------------------------------------

export async function fetchTicketMessages(
  ticketId: number,
): Promise<SupportMessageRow[]> {
  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.ticketId, String(ticketId)));
      return rows.map(mapMessageRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  params.append("filter__ticket_id__equal", String(ticketId));
  return fetchTableRows<SupportMessageRow>(TABLE_IDS.messages, params);
}

export async function createTicketMessage(
  data: CreateMessageData,
): Promise<SupportMessageRow> {
  const now = new Date().toISOString();

  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(supportMessages)
        .values({
          ticketId: String(data.ticket_id),
          institutionId: String(data.institution_id),
          authorName: data.author_name,
          authorEmail: data.author_email,
          authorPhone: data.author_phone,
          authorRole: data.author_role,
          content: data.content,
          createdAt: now,
        })
        .returning();
      return mapMessageRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback
  const payload: Record<string, unknown> = {
    ticket_id: data.ticket_id,
    institution_id: data.institution_id,
    author_name: data.author_name,
    author_email: data.author_email,
    author_phone: data.author_phone,
    author_role: data.author_role,
    content: data.content,
    created_at: now,
  };
  return createRow<SupportMessageRow>(TABLE_IDS.messages, payload);
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export async function searchKB(query: string): Promise<SupportKBRow[]> {
  if (!query.trim()) return [];
  const term = query.trim().toLowerCase();

  if (useDirectDb("support")) {
    const _dr = await tryDrizzle(async () => {
      const pattern = `%${term}%`;
      const rows = await db
        .select()
        .from(supportKb)
        .where(
          or(
            ilike(supportKb.title, pattern),
            ilike(supportKb.tags, pattern),
            ilike(supportKb.content, pattern),
          ),
        );
      return rows.map(mapKbRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // Baserow fallback (fetch all + filter client-side)
  const params = new URLSearchParams({ user_field_names: "true", size: "200" });
  const rows = await fetchTableRows<SupportKBRow>(TABLE_IDS.kb, params);
  return rows.filter((row) => {
    const title = (row.title ?? "").toLowerCase();
    const tags = (row.tags ?? "").toLowerCase();
    const content = (row.content ?? "").toLowerCase();
    return title.includes(term) || tags.includes(term) || content.includes(term);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryToSector(category: string): string {
  switch (category) {
    case "sistema":
      return "Suporte Técnico";
    case "ia":
      return "Personalização IA";
    case "financeiro":
      return "Financeiro";
    default:
      return "Suporte Técnico";
  }
}

import axios from "axios";
import type {
  Template,
  CreateTemplateInput,
} from "@/lib/waba/schemas";

// ---------------------------------------------------------------------------
// Config (server-only)
// ---------------------------------------------------------------------------

const WABA_ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN;
const GRAPH_API_VERSION =
  process.env.WABA_GRAPH_API_VERSION ?? "v22.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const ensureToken = () => {
  if (!WABA_ACCESS_TOKEN) {
    throw new Error("WABA_ACCESS_TOKEN não configurado");
  }
};

const graphClient = () => {
  ensureToken();
  return axios.create({
    baseURL: GRAPH_BASE_URL,
    headers: {
      Authorization: `Bearer ${WABA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetaListResponse = {
  data: Template[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
};

type MetaCreateResponse = {
  id: string;
  status: string;
  category: string;
};

type MetaDeleteResponse = {
  success: boolean;
};

// ---------------------------------------------------------------------------
// List templates
// ---------------------------------------------------------------------------

export async function listTemplates(
  wabaId: string,
  params?: { status?: string; limit?: number },
): Promise<{ data: Template[]; paging?: MetaListResponse["paging"] }> {
  const client = graphClient();

  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 50));

  const url = `/${wabaId}/message_templates?${qs.toString()}`;
  const response = await client.get<MetaListResponse>(url);

  return {
    data: response.data.data ?? [],
    paging: response.data.paging,
  };
}

// ---------------------------------------------------------------------------
// Get template by name
// ---------------------------------------------------------------------------

export async function getTemplate(
  wabaId: string,
  templateName: string,
): Promise<Template | null> {
  const client = graphClient();

  const qs = new URLSearchParams({ name: templateName });
  const url = `/${wabaId}/message_templates?${qs.toString()}`;
  const response = await client.get<MetaListResponse>(url);

  const templates = response.data.data ?? [];
  return templates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Create template (submit for approval)
// ---------------------------------------------------------------------------

export async function createTemplate(
  wabaId: string,
  payload: CreateTemplateInput,
): Promise<MetaCreateResponse> {
  const client = graphClient();

  const url = `/${wabaId}/message_templates`;
  const response = await client.post<MetaCreateResponse>(url, payload);

  return response.data;
}

// ---------------------------------------------------------------------------
// Delete template
// ---------------------------------------------------------------------------

export async function deleteTemplate(
  wabaId: string,
  templateName: string,
): Promise<boolean> {
  const client = graphClient();

  const qs = new URLSearchParams({ name: templateName });
  const url = `/${wabaId}/message_templates?${qs.toString()}`;
  const response = await client.delete<MetaDeleteResponse>(url);

  return response.data.success === true;
}

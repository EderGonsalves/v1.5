/**
 * Codilo API Service — OAuth2 + Lawsuit Monitoring + Capturaweb Queries
 * Server-only: uses CODILO_CLIENT_ID / CODILO_CLIENT_SECRET
 *
 * API docs: https://docs.codilo.com.br/
 *
 * Two APIs:
 * - Push API (api.push.codilo.com.br) — continuous daily monitoring
 * - Capture API (api.capturaweb.com.br) — one-time queries (autorequest)
 *
 * Autorequest flow:
 * 1. POST /autorequest → spawns sub-requests per court
 * 2. Each sub-request sends callback: { action, requestId, status }
 * 3. On status "success" → GET /request/{requestId} to fetch full data
 * 4. Response: { data: [{ cover, properties, people, steps }] }
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CODILO_CLIENT_ID = process.env.CODILO_CLIENT_ID ?? "";
const CODILO_CLIENT_SECRET = process.env.CODILO_CLIENT_SECRET ?? "";
const CODILO_WEBHOOK_SECRET = process.env.CODILO_WEBHOOK_SECRET ?? "";

const AUTH_URL = "https://auth.codilo.com.br/oauth/token";
const PUSH_API_URL = "https://api.push.codilo.com.br/v1";
const CAPTURE_API_URL = "https://api.capturaweb.com.br/v1";

// ---------------------------------------------------------------------------
// OAuth2 token cache
// ---------------------------------------------------------------------------

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  if (!CODILO_CLIENT_ID || !CODILO_CLIENT_SECRET) {
    throw new Error("CODILO_CLIENT_ID / CODILO_CLIENT_SECRET não configurados");
  }

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      id: CODILO_CLIENT_ID,
      secret: CODILO_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codilo OAuth falhou (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: string | number;
    token_type: string;
  };

  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + Number(data.expires_in) * 1000;

  return _cachedToken;
}

// ---------------------------------------------------------------------------
// Types — Codilo API responses
// ---------------------------------------------------------------------------

export type CodiloMonitoringResponse = {
  id: string;
  cnj: string;
  created_at: string;
  courts?: Array<{ court: string; status: string }>;
};

export type CodiloQueryResponse = {
  autorequestId: string;
  subRequestIds: string[];
  _raw?: Record<string, unknown>;
};

/** GET /request/{id} response */
export type CodiloRequestData = {
  success: boolean;
  type?: string;
  requested?: {
    id: string;
    status: string;
    platform: string;
    court: string;
    respondedAt: string;
  };
  info?: {
    platform: string;
    court: string;
  };
  data?: CodiloLawsuit[];
};

export type CodiloLawsuit = {
  cover?: Record<string, string>;
  properties?: Record<string, unknown>;
  people?: Array<{
    name?: string;
    nome?: string;
    pole?: string;
    polo?: string;
    type?: string;
    tipo?: string;
    oab?: string;
    [key: string]: unknown;
  }>;
  steps?: Array<{
    date?: string;
    description?: string;
    descricao?: string;
    [key: string]: unknown;
  }>;
};

// ---------------------------------------------------------------------------
// Start monitoring (daily — Push API)
// ---------------------------------------------------------------------------

export async function startLawsuitMonitoring(
  cnj: string,
  callbackUrl: string,
  caseId: number,
): Promise<CodiloMonitoringResponse> {
  const token = await getAccessToken();

  const response = await fetch(`${PUSH_API_URL}/processo/novo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cnj,
      callbacks: [
        {
          method: "POST",
          url: callbackUrl,
          headers: {
            "X-Webhook-Secret": CODILO_WEBHOOK_SECRET,
            "X-Case-Id": String(caseId),
          },
        },
      ],
      ignore: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codilo monitoramento falhou (${response.status}): ${text}`);
  }

  return (await response.json()) as CodiloMonitoringResponse;
}

// ---------------------------------------------------------------------------
// Query once (autorequest — Capture API)
// ---------------------------------------------------------------------------

export async function queryLawsuitOnce(
  cnj: string,
  callbackUrl: string,
  caseId: number,
): Promise<CodiloQueryResponse> {
  const token = await getAccessToken();

  const response = await fetch(`${CAPTURE_API_URL}/autorequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: "cnj",
      value: cnj,
      callbacks: [
        {
          method: "POST",
          url: `${callbackUrl}?secret=${encodeURIComponent(CODILO_WEBHOOK_SECRET)}&caseId=${caseId}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codilo consulta falhou (${response.status}): ${text}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  console.log("[codilo] autorequest response:", JSON.stringify(raw).slice(0, 2000));

  // Response: { success, data: { id, key, value, requests: [{ id, status, ... }], createdAt } }
  const respData = raw.data as Record<string, unknown> | undefined;
  const autorequestId = String(respData?.id ?? raw.id ?? "");
  const requests = (respData?.requests ?? []) as Array<Record<string, unknown>>;
  const subRequestIds = requests.map((r) => String(r.id ?? "")).filter(Boolean);

  console.log("[codilo] autorequest created:", { autorequestId, subRequests: subRequestIds.length });

  return { autorequestId, subRequestIds, _raw: raw };
}

// ---------------------------------------------------------------------------
// Get individual request result — GET /request/{requestId}
// ---------------------------------------------------------------------------

export async function getRequestResult(
  requestId: string,
): Promise<CodiloRequestData> {
  const token = await getAccessToken();

  const url = `${CAPTURE_API_URL}/request/${requestId}`;
  console.log("[codilo] Fetching request result:", url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[codilo] GET /request/${requestId} → ${response.status}:`, text);
    throw new Error(`Codilo resultado falhou (${response.status}): ${text}`);
  }

  const result = (await response.json()) as CodiloRequestData;
  console.log(
    "[codilo] Request result:",
    JSON.stringify({
      success: result.success,
      type: result.type,
      status: result.requested?.status,
      court: result.info?.court,
      dataCount: result.data?.length ?? 0,
      stepsCount: result.data?.[0]?.steps?.length ?? 0,
    }),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Validate webhook callback
// ---------------------------------------------------------------------------

export function validateCodiloCallback(
  webhookSecret: string | null,
  userAgent: string | null,
): boolean {
  if (!CODILO_WEBHOOK_SECRET) {
    console.warn("[codilo] CODILO_WEBHOOK_SECRET not configured");
    return false;
  }
  if (webhookSecret !== CODILO_WEBHOOK_SECRET) {
    console.warn("[codilo] Webhook secret mismatch:", { received: webhookSecret?.slice(0, 8) + "..." });
    return false;
  }
  if (userAgent) {
    console.log("[codilo] Callback User-Agent:", userAgent);
  }
  return true;
}

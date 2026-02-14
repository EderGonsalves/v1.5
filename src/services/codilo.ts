/**
 * Codilo API Service — OAuth2 + Lawsuit Monitoring
 * Server-only: uses CODILO_CLIENT_ID / CODILO_CLIENT_SECRET
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
  // Return cached if still valid (with 5-minute margin)
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
// Types
// ---------------------------------------------------------------------------

export type CodiloMonitoringResponse = {
  id: string;
  cnj: string;
  created_at: string;
  courts?: Array<{
    court: string;
    status: string;
  }>;
};

export type CodiloQueryResponse = {
  requestId: string;
  status: string;
  // Raw response for debugging field names
  _raw?: Record<string, unknown>;
};

export type CodiloRequestResult = {
  requestId: string;
  status: string;
  results?: Array<{
    court: string;
    data: unknown;
  }>;
};

// ---------------------------------------------------------------------------
// Start monitoring (diário)
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
// Query once (consulta avulsa)
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
  console.log("[codilo] autorequest response:", JSON.stringify(raw));

  // Codilo may return requestId in different field names
  const requestId = String(
    raw.requestId ?? raw.request_id ?? raw.id ?? raw.requestid ?? "",
  );

  return {
    requestId,
    status: String(raw.status ?? "pending"),
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Get request result
// ---------------------------------------------------------------------------

export async function getRequestResult(
  requestId: string,
): Promise<CodiloRequestResult> {
  const token = await getAccessToken();

  // Try multiple endpoint patterns
  const urls = [
    `${CAPTURE_API_URL}/request/${requestId}`,
    `${CAPTURE_API_URL}/autorequest/${requestId}`,
    `${CAPTURE_API_URL}/request/status/${requestId}`,
  ];

  let lastError = "";

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 404) {
        // This endpoint doesn't exist, try next
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = `Codilo resultado falhou (${response.status}): ${text}`;
        console.warn(`[codilo] ${url} → ${response.status}:`, text);
        continue;
      }

      const raw = (await response.json()) as Record<string, unknown>;
      console.log(`[codilo] getRequestResult (${url}) response:`, JSON.stringify(raw));

      return {
        requestId,
        status: String(raw.status ?? raw.state ?? "pending"),
        results: raw.results as CodiloRequestResult["results"],
      };
    } catch (err) {
      console.warn(`[codilo] ${url} error:`, err);
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError || "Não foi possível obter resultado da Codilo");
}

// ---------------------------------------------------------------------------
// Validate webhook callback
// ---------------------------------------------------------------------------

export function validateCodiloCallback(
  webhookSecret: string | null,
  userAgent: string | null,
): boolean {
  if (!CODILO_WEBHOOK_SECRET) return false;
  if (webhookSecret !== CODILO_WEBHOOK_SECRET) return false;
  // Codilo sends: CodiloCallback/1.0 (+http://codilo.com.br/)
  if (userAgent && !userAgent.includes("CodiloCallback")) return false;
  return true;
}

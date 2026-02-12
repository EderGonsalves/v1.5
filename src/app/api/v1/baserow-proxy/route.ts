import { type NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ||
  process.env.NEXT_PUBLIC_BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "";

const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ||
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ||
  process.env.AUTOMATION_DB_TOKEN ||
  "";

/**
 * Generic Baserow proxy – keeps the API token server-side.
 *
 * Accepts: POST { url, method?, data? }
 *   - `url` must start with the configured BASEROW_API_URL
 *   - `method` defaults to "GET"
 *   - `data` is the JSON body for POST/PATCH/PUT requests
 */
export async function POST(request: NextRequest) {
  // 1. Auth check
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2. Parse body
  let body: { url?: string; method?: string; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { url, method = "GET", data } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL obrigatória" }, { status: 400 });
  }

  // 3. Validate URL – must target our Baserow instance
  if (!BASEROW_API_URL) {
    return NextResponse.json(
      { error: "BASEROW_API_URL não configurado" },
      { status: 500 },
    );
  }

  if (!url.startsWith(BASEROW_API_URL)) {
    return NextResponse.json(
      { error: "URL não permitida" },
      { status: 403 },
    );
  }

  // 4. Forward request to Baserow
  const allowedMethod = method.toUpperCase();
  const headers: Record<string, string> = {
    Authorization: `Token ${BASEROW_API_KEY}`,
    "Content-Type": "application/json",
  };

  const fetchOptions: RequestInit = {
    method: allowedMethod,
    headers,
  };

  if (data !== undefined && allowedMethod !== "GET" && allowedMethod !== "DELETE") {
    fetchOptions.body = JSON.stringify(data);
  }

  try {
    const upstream = await fetch(url, fetchOptions);
    const contentType = upstream.headers.get("content-type") || "";

    // DELETE with 204 has no body
    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    if (contentType.includes("application/json")) {
      const json = await upstream.json();
      return NextResponse.json(json, { status: upstream.status });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao conectar ao Baserow";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

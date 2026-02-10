import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = "automation-db.riasistemas.com.br";

/**
 * Proxy de mídia que serve arquivos do Baserow com os headers corretos.
 * Resolve o problema do WhatsApp rejeitar URLs com Content-Type errado ou redirects.
 *
 * GET /api/media/proxy?url=<baserow_url>&type=<mime_type>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const mimeType = request.nextUrl.searchParams.get("type") || "application/octet-stream";

  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  // Restringir a URLs do Baserow para evitar abuso como proxy aberto
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "forbidden_host" }, { status: 403 });
  }

  try {
    const upstream = await fetch(url, { redirect: "follow" });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "upstream_error", status: upstream.status },
        { status: 502 },
      );
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[media-proxy] Falha ao buscar arquivo:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}

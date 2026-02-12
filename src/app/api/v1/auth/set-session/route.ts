import { NextRequest, NextResponse } from "next/server";

import { parseAuthCookie, setAuthCookie } from "@/lib/auth/session";

/**
 * Accepts auth data from the client (localStorage hydration) and sets
 * the HttpOnly cookie. This allows the client to restore sessions after
 * the HttpOnly cookie expires, without needing to re-login.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const auth = parseAuthCookie(JSON.stringify(body));

    if (!auth) {
      return NextResponse.json(
        { error: "Dados de autenticação inválidos" },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ success: true });
    setAuthCookie(response, auth);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Erro ao processar sessão" },
      { status: 400 },
    );
  }
}

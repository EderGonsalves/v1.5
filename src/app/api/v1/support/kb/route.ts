import { NextRequest, NextResponse } from "next/server";
import { searchKB } from "@/services/support";
import { getRequestAuth } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json({ articles: [] });
  }

  try {
    const articles = await searchKB(query);
    return NextResponse.json({ articles });
  } catch (err) {
    console.error("Erro ao buscar KB:", err);
    return NextResponse.json(
      { error: "Erro ao buscar base de conhecimento" },
      { status: 500 },
    );
  }
}

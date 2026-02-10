import { NextRequest, NextResponse } from "next/server";

import { getBaserowCases, type BaserowCaseRow } from "@/services/api";

type ConversationItem = {
  id: number;
  caseId: number | string;
  customerName: string;
  customerPhone: string;
  lastMessage?: string;
  lastMessageAt: string | null;
  paused: boolean;
  bjCaseId?: string | number | null;
  etapa?: string;
  wabaPhoneNumber: string | null;
};

type CacheEntry = {
  conversations: ConversationItem[];
  timestamp: number;
};

const conversationsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const verifyAuth = (
  request: NextRequest,
  institutionId: string,
): { valid: boolean; error?: string; userInstitutionId?: number } => {
  const authCookie = request.cookies.get("onboarding_auth");
  if (!authCookie?.value) {
    return { valid: false, error: "Não autenticado" };
  }
  try {
    const authData = JSON.parse(authCookie.value);
    const userInstitutionId = authData?.institutionId;
    if (userInstitutionId === 4) {
      return { valid: true, userInstitutionId };
    }
    if (String(userInstitutionId) !== String(institutionId)) {
      return { valid: false, error: "Acesso não autorizado" };
    }
    return { valid: true, userInstitutionId };
  } catch {
    return { valid: false, error: "Token inválido" };
  }
};

const normalizeRow = (row: BaserowCaseRow): ConversationItem => {
  const rawDate = row.Data ?? row.data ?? null;
  let lastMessageAt: string | null = null;
  if (rawDate) {
    const parsed = new Date(String(rawDate));
    if (!Number.isNaN(parsed.getTime())) {
      lastMessageAt = parsed.toISOString();
    }
  }

  const rawWabaPhone = row.display_phone_number;
  const wabaPhoneNumber = rawWabaPhone
    ? String(rawWabaPhone).replace(/\D/g, "").trim() || null
    : null;

  return {
    id: row.id,
    caseId: row.CaseId ?? row.id,
    customerName: row.CustumerName ?? "Cliente",
    customerPhone: row.CustumerPhone ?? "",
    lastMessage: row.Resumo ?? row.DepoimentoInicial ?? undefined,
    lastMessageAt,
    paused: row.IApause === "SIM",
    bjCaseId: row.BJCaseId ?? null,
    etapa: row.EtapaPerguntas ?? row.EtapaFinal ?? undefined,
    wabaPhoneNumber,
  };
};

export async function GET(request: NextRequest) {
  try {
    const institutionIdParam = request.nextUrl.searchParams.get("institutionId");
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (!institutionIdParam) {
      return NextResponse.json(
        { error: "institutionId é obrigatório" },
        { status: 400 },
      );
    }

    const institutionId = Number(institutionIdParam);
    if (Number.isNaN(institutionId)) {
      return NextResponse.json(
        { error: "institutionId inválido" },
        { status: 400 },
      );
    }

    const auth = verifyAuth(request, institutionIdParam);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Verificar cache em memória
    const cacheKey = `conv_${institutionId}`;
    if (!forceRefresh) {
      const cached = conversationsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
          conversations: cached.conversations,
          total: cached.conversations.length,
          cached: true,
        });
      }
    }

    // Buscar do Baserow (com filtro server-side se não-admin)
    const response = await getBaserowCases({
      institutionId,
      pageSize: 200,
      fetchAll: true,
    });

    // Normalizar e ordenar por ID desc (mais recentes primeiro)
    const conversations = response.results
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
      .map(normalizeRow);

    // Salvar no cache
    conversationsCache.set(cacheKey, {
      conversations,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      conversations,
      total: conversations.length,
      cached: false,
    });
  } catch (error) {
    console.error("[conversations] Erro:", error);
    return NextResponse.json(
      {
        error: "Erro ao carregar conversas",
        message: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}

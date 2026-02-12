import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import {
  computeCaseStatistics,
  type CaseStatistics,
} from "@/lib/case-stats";
import { getBaserowCases } from "@/services/api";

// Cache em memória com TTL
type CacheEntry = {
  stats: CaseStatistics;
  timestamp: number;
};

const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getCacheKey = (institutionId: number | string): string => {
  return `stats_${institutionId}`;
};

const getFromCache = (institutionId: number | string): CaseStatistics | null => {
  const key = getCacheKey(institutionId);
  const entry = statsCache.get(key);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    statsCache.delete(key);
    return null;
  }

  return entry.stats;
};

const setCache = (institutionId: number | string, stats: CaseStatistics): void => {
  const key = getCacheKey(institutionId);
  statsCache.set(key, {
    stats,
    timestamp: Date.now(),
  });
};

// Função auxiliar para verificar autenticação
const verifyAuth = (
  request: NextRequest,
  institutionId: string,
): { valid: boolean; error?: string; userInstitutionId?: number } => {
  const auth = getRequestAuth(request);
  if (!auth) {
    return { valid: false, error: "Não autenticado" };
  }
  if (auth.institutionId === 4) {
    return { valid: true, userInstitutionId: auth.institutionId };
  }
  if (String(auth.institutionId) !== String(institutionId)) {
    return { valid: false, error: "Acesso não autorizado a esta instituição" };
  }
  return { valid: true, userInstitutionId: auth.institutionId };
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const institutionIdParam = searchParams.get("institutionId");
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!institutionIdParam) {
      return NextResponse.json(
        { error: "institutionId é obrigatório" },
        { status: 400 },
      );
    }

    const institutionId = Number(institutionIdParam);
    if (Number.isNaN(institutionId)) {
      return NextResponse.json(
        { error: "institutionId deve ser um número válido" },
        { status: 400 },
      );
    }

    // Verificar autenticação
    const auth = verifyAuth(request, institutionIdParam);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Verificar cache se não for forceRefresh
    if (!forceRefresh) {
      const cachedStats = getFromCache(institutionId);
      if (cachedStats) {
        const cacheEntry = statsCache.get(getCacheKey(institutionId));
        return NextResponse.json({
          ...cachedStats,
          cached: true,
          cachedAt: cacheEntry ? new Date(cacheEntry.timestamp).toISOString() : null,
        });
      }
    }

    // Buscar todos os casos do Baserow
    const response = await getBaserowCases({
      institutionId,
      pageSize: 200,
      fetchAll: true,
    });

    // Calcular estatísticas
    const stats = computeCaseStatistics(response.results);

    // Salvar no cache
    setCache(institutionId, stats);

    return NextResponse.json({
      ...stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao calcular estatísticas",
      },
      { status: 500 },
    );
  }
}

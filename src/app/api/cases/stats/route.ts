import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import {
  computeCaseStatistics,
  getCaseInstitutionId,
  getEmptyCaseStatistics,
  stageOrder,
  type CaseStatistics,
} from "@/lib/case-stats";
import { getBaserowCases, getCaseStatisticsSQL } from "@/services/api";

// Cache em memória com TTL
type CacheEntry = {
  stats: CaseStatistics;
  institutionBreakdown?: Record<string, CaseStatistics>;
  timestamp: number;
};

const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getCacheKey = (institutionId: number | string): string => {
  return `stats_${institutionId}`;
};

const getFromCache = (institutionId: number | string): CacheEntry | null => {
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

  return entry;
};

const setCache = (
  institutionId: number | string,
  stats: CaseStatistics,
  institutionBreakdown?: Record<string, CaseStatistics>,
): void => {
  const key = getCacheKey(institutionId);
  statsCache.set(key, {
    stats,
    institutionBreakdown,
    timestamp: Date.now(),
  });
};

/** Convert a SQL aggregate row to CaseStatistics */
function sqlRowToStats(row: {
  total: number;
  paused: number;
  etapa_final: number;
  etapa_perguntas: number;
  depoimento_inicial: number;
  last_7_days: number;
  last_30_days: number;
}): CaseStatistics {
  const totalCases = row.total;
  const stageCounts = {
    DepoimentoInicial: row.depoimento_inicial,
    EtapaPerguntas: row.etapa_perguntas,
    EtapaFinal: row.etapa_final,
  } as Record<(typeof stageOrder)[number], number>;

  const stagePercentages = {} as Record<(typeof stageOrder)[number], number>;
  for (const stage of stageOrder) {
    stagePercentages[stage] = totalCases
      ? Number(((stageCounts[stage] / totalCases) * 100).toFixed(1))
      : 0;
  }

  const pausedPercentage = totalCases
    ? Number(((row.paused / totalCases) * 100).toFixed(1))
    : 0;

  return {
    totalCases,
    pausedCases: row.paused,
    stageCounts,
    stagePercentages,
    pausedPercentage,
    casesLast7Days: row.last_7_days,
    casesLast30Days: row.last_30_days,
  };
}

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
    const authResult = verifyAuth(request, institutionIdParam);
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const isSysAdmin = authResult.userInstitutionId === 4;

    // Verificar cache se não for forceRefresh
    if (!forceRefresh) {
      const cached = getFromCache(institutionId);
      if (cached) {
        return NextResponse.json({
          ...cached.stats,
          institutionBreakdown: cached.institutionBreakdown,
          cached: true,
          cachedAt: new Date(cached.timestamp).toISOString(),
        });
      }
    }

    // --- Tentar SQL agregado (rápido) ---
    const sqlResult = await getCaseStatisticsSQL(institutionId);
    if (sqlResult && sqlResult.total) {
      const rows = Array.isArray(sqlResult.total) ? sqlResult.total : [];

      if (isSysAdmin) {
        // SysAdmin: retorna breakdown por instituição + totais
        const breakdown: Record<string, CaseStatistics> = {};
        const totals = {
          total: 0, paused: 0, etapa_final: 0, etapa_perguntas: 0,
          depoimento_inicial: 0, last_7_days: 0, last_30_days: 0,
        };

        for (const row of rows) {
          const instId = String(row.institution_id || "unknown");
          breakdown[instId] = sqlRowToStats(row);
          totals.total += row.total;
          totals.paused += row.paused;
          totals.etapa_final += row.etapa_final;
          totals.etapa_perguntas += row.etapa_perguntas;
          totals.depoimento_inicial += row.depoimento_inicial;
          totals.last_7_days += row.last_7_days;
          totals.last_30_days += row.last_30_days;
        }

        const stats = sqlRowToStats(totals);
        setCache(institutionId, stats, breakdown);

        return NextResponse.json({
          ...stats,
          institutionBreakdown: breakdown,
          cached: false,
          cachedAt: new Date().toISOString(),
        });
      }

      // Usuário normal: single institution
      const row = rows[0];
      const stats = row ? sqlRowToStats(row) : getEmptyCaseStatistics();
      setCache(institutionId, stats);

      return NextResponse.json({
        ...stats,
        cached: false,
        cachedAt: new Date().toISOString(),
      });
    }

    // --- Fallback: carregar todos os casos e computar em JS ---
    const response = await getBaserowCases({
      institutionId,
      pageSize: 200,
      fetchAll: true,
    });

    const stats = computeCaseStatistics(response.results);

    // SysAdmin: agrupar por instituição para preencher o dropdown
    let institutionBreakdown: Record<string, CaseStatistics> | undefined;
    if (isSysAdmin && response.results.length > 0) {
      const grouped = new Map<string, typeof response.results>();
      for (const row of response.results) {
        const instId = getCaseInstitutionId(row) || "unknown";
        const arr = grouped.get(instId);
        if (arr) {
          arr.push(row);
        } else {
          grouped.set(instId, [row]);
        }
      }
      institutionBreakdown = {};
      for (const [instId, rows] of grouped) {
        institutionBreakdown[instId] = computeCaseStatistics(rows);
      }
    }

    setCache(institutionId, stats, institutionBreakdown);

    return NextResponse.json({
      ...stats,
      institutionBreakdown,
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

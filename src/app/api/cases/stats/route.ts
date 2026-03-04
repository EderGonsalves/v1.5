import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import {
  computeCaseStatistics,
  getCaseInstitutionId,
  getEmptyCaseStatistics,
  stageOrder,
  type CaseStatistics,
  type ResponsavelStats,
} from "@/lib/case-stats";
import { getBaserowCases, getCaseStatisticsSQL, getResponsavelStatsSQL, getActiveUsersSQL, type ActiveUsersSQLRow } from "@/services/api";

// Active users shape for response
type ActiveUsersData = {
  onlineNow: number;
  active24h: number;
  active7d: number;
  totalUsers: number;
  byInstitution?: Record<string, { onlineNow: number; active24h: number; active7d: number; totalUsers: number }>;
};

// Cache em memória com TTL
type CacheEntry = {
  stats: CaseStatistics;
  institutionBreakdown?: Record<string, CaseStatistics>;
  activeUsers?: ActiveUsersData;
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
  activeUsers?: ActiveUsersData,
): void => {
  const key = getCacheKey(institutionId);
  statsCache.set(key, {
    stats,
    institutionBreakdown,
    activeUsers,
    timestamp: Date.now(),
  });
};

/** Convert a SQL aggregate row to CaseStatistics */
function sqlRowToStats(
  row: {
    total: number;
    paused: number;
    etapa_final: number;
    etapa_perguntas: number;
    depoimento_inicial: number;
    last_7_days: number;
    last_30_days: number;
    won: number;
    lost: number;
  },
  responsavelBreakdown: ResponsavelStats[] = [],
): CaseStatistics {
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

  const won = row.won;
  const lost = row.lost;
  const pending = totalCases - won - lost;
  const pct = (v: number) => totalCases ? Number(((v / totalCases) * 100).toFixed(1)) : 0;

  return {
    totalCases,
    pausedCases: row.paused,
    stageCounts,
    stagePercentages,
    pausedPercentage,
    casesLast7Days: row.last_7_days,
    casesLast30Days: row.last_30_days,
    outcomeCounts: { won, lost, pending },
    outcomePercentages: { won: pct(won), lost: pct(lost), pending: pct(pending) },
    responsavelBreakdown,
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
          activeUsers: cached.activeUsers,
          cached: true,
          cachedAt: new Date(cached.timestamp).toISOString(),
        });
      }
    }

    // --- Tentar SQL agregado (rápido) ---
    const [sqlResult, responsavelRows, activeUsersRows] = await Promise.all([
      getCaseStatisticsSQL(institutionId),
      getResponsavelStatsSQL(institutionId),
      getActiveUsersSQL(institutionId),
    ]);

    // Build activeUsers data from SQL rows
    const buildActiveUsersData = (rows: ActiveUsersSQLRow[] | null, forSysAdmin: boolean): ActiveUsersData | undefined => {
      if (!rows || rows.length === 0) return undefined;
      const totals = { onlineNow: 0, active24h: 0, active7d: 0, totalUsers: 0 };
      const byInstitution: Record<string, { onlineNow: number; active24h: number; active7d: number; totalUsers: number }> = {};
      for (const r of rows) {
        totals.onlineNow += r.online_now;
        totals.active24h += r.active_24h;
        totals.active7d += r.active_7d;
        totals.totalUsers += r.total_users;
        if (forSysAdmin) {
          byInstitution[r.institution_id || "unknown"] = {
            onlineNow: r.online_now,
            active24h: r.active_24h,
            active7d: r.active_7d,
            totalUsers: r.total_users,
          };
        }
      }
      return { ...totals, ...(forSysAdmin ? { byInstitution } : {}) };
    };

    if (sqlResult && sqlResult.total) {
      const rows = Array.isArray(sqlResult.total) ? sqlResult.total : [];

      // Build responsável breakdown from SQL
      const respBreakdown: ResponsavelStats[] = (responsavelRows ?? []).map((r) => ({
        name: r.responsavel,
        total: r.total,
        won: r.won,
        lost: r.lost,
        pending: r.total - r.won - r.lost,
      }));

      if (isSysAdmin) {
        // SysAdmin: retorna breakdown por instituição + totais
        const breakdown: Record<string, CaseStatistics> = {};
        const totals = {
          total: 0, paused: 0, etapa_final: 0, etapa_perguntas: 0,
          depoimento_inicial: 0, last_7_days: 0, last_30_days: 0,
          won: 0, lost: 0,
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
          totals.won += row.won;
          totals.lost += row.lost;
        }

        const stats = sqlRowToStats(totals, respBreakdown);
        const activeUsers = buildActiveUsersData(activeUsersRows, true);
        setCache(institutionId, stats, breakdown, activeUsers);

        return NextResponse.json({
          ...stats,
          institutionBreakdown: breakdown,
          activeUsers,
          cached: false,
          cachedAt: new Date().toISOString(),
        });
      }

      // Usuário normal: single institution
      const row = rows[0];
      const stats = row ? sqlRowToStats(row, respBreakdown) : getEmptyCaseStatistics();
      const activeUsers = buildActiveUsersData(activeUsersRows, false);
      setCache(institutionId, stats, undefined, activeUsers);

      return NextResponse.json({
        ...stats,
        activeUsers,
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

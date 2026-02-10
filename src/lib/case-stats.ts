import type { BaserowCaseRow } from "@/services/api";

export type CaseStage = "DepoimentoInicial" | "EtapaPerguntas" | "EtapaFinal";

export const stageOrder: CaseStage[] = [
  "DepoimentoInicial",
  "EtapaPerguntas",
  "EtapaFinal",
];

export const stageLabels: Record<CaseStage, string> = {
  DepoimentoInicial: "Depoimento Inicial",
  EtapaPerguntas: "Etapa de Perguntas",
  EtapaFinal: "Etapa Final",
};

export const stageColors: Record<CaseStage, string> = {
  DepoimentoInicial:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EtapaPerguntas:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  EtapaFinal:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const isTruthyFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return !["não", "nao", "false", "0", "off"].includes(normalized);
  }
  return Boolean(value);
};

const isPausedFlag = (value: unknown): boolean => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["sim", "pausado", "true", "1", "yes"].includes(normalized);
  }
  return isTruthyFlag(value);
};

export const getCaseStage = (caseRow: BaserowCaseRow): CaseStage | null => {
  if (isTruthyFlag(caseRow.EtapaFinal)) {
    return "EtapaFinal";
  }
  if (isTruthyFlag(caseRow.EtapaPerguntas)) {
    return "EtapaPerguntas";
  }
  if (isTruthyFlag(caseRow.DepoimentoInicial)) {
    return "DepoimentoInicial";
  }
  return null;
};

export const getCaseInstitutionId = (
  caseRow: BaserowCaseRow,
): string | null => {
  const rawValue = caseRow.InstitutionID ?? caseRow["body.auth.institutionId"];

  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return String(rawValue);
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      return String(parsed);
    }
    return trimmed;
  }

  return null;
};

export type CaseStatistics = {
  totalCases: number;
  pausedCases: number;
  stageCounts: Record<CaseStage, number>;
  stagePercentages: Record<CaseStage, number>;
  pausedPercentage: number;
  casesLast7Days: number;
  casesLast30Days: number;
};

const createEmptyCounts = (): Record<CaseStage, number> =>
  stageOrder.reduce(
    (acc, stage) => {
      acc[stage] = 0;
      return acc;
    },
    {} as Record<CaseStage, number>,
  );

const createEmptyPercentages = (): Record<CaseStage, number> =>
  stageOrder.reduce(
    (acc, stage) => {
      acc[stage] = 0;
      return acc;
    },
    {} as Record<CaseStage, number>,
  );

export const getEmptyCaseStatistics = (): CaseStatistics => ({
  totalCases: 0,
  pausedCases: 0,
  stageCounts: createEmptyCounts(),
  stagePercentages: createEmptyPercentages(),
  pausedPercentage: 0,
  casesLast7Days: 0,
  casesLast30Days: 0,
});

export const isCasePaused = (caseRow: BaserowCaseRow): boolean =>
  isPausedFlag(caseRow.IApause);

const parseCaseDate = (caseRow: BaserowCaseRow): number => {
  const raw = caseRow.Data ?? caseRow.data ?? (caseRow as Record<string, unknown>).created_on;
  if (!raw) return 0;
  const str = typeof raw === "string" ? raw.trim() : String(raw);
  if (!str) return 0;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export const computeCaseStatistics = (
  rows: BaserowCaseRow[],
): CaseStatistics => {
  if (!rows.length) {
    return getEmptyCaseStatistics();
  }

  const stageCounts = createEmptyCounts();
  let pausedCases = 0;

  const now = Date.now();
  const ms7Days = 7 * 24 * 60 * 60 * 1000;
  const ms30Days = 30 * 24 * 60 * 60 * 1000;
  let casesLast7Days = 0;
  let casesLast30Days = 0;

  rows.forEach((caseRow) => {
    const stage = getCaseStage(caseRow);
    if (stage) {
      stageCounts[stage] += 1;
    }

    if (isCasePaused(caseRow)) {
      pausedCases += 1;
    }

    const ts = parseCaseDate(caseRow);
    if (ts > 0) {
      const age = now - ts;
      if (age <= ms30Days) {
        casesLast30Days += 1;
        if (age <= ms7Days) {
          casesLast7Days += 1;
        }
      }
    }
  });

  const totalCases = rows.length;
  const stagePercentages = stageOrder.reduce(
    (acc, stage) => {
      acc[stage] = totalCases
        ? Number(((stageCounts[stage] / totalCases) * 100).toFixed(1))
        : 0;
      return acc;
    },
    {} as Record<CaseStage, number>,
  );

  const pausedPercentage = totalCases
    ? Number(((pausedCases / totalCases) * 100).toFixed(1))
    : 0;

  return {
    totalCases,
    pausedCases,
    stageCounts,
    stagePercentages,
    pausedPercentage,
    casesLast7Days,
    casesLast30Days,
  };
};

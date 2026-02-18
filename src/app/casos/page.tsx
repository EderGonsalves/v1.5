"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getBaserowCases,
  getBaserowConfigs,
  updateBaserowCase,
  type BaserowCaseRow,
  type BaserowConfigRow,
} from "@/services/api";
import { KanbanCardDetail } from "@/components/kanban/KanbanCardDetail";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { MessageSquareText, RefreshCw, List, Kanban, Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePermissionsStatus } from "@/hooks/use-permissions-status";
import { KanbanView } from "@/components/kanban/KanbanView";
import {
  CaseStage,
  computeCaseStatistics,
  getCaseInstitutionId,
  getCaseStage,
  isCasePaused,
  stageColors,
  stageLabels,
  stageOrder,
} from "@/lib/case-stats";
import { useStatistics } from "@/hooks/use-statistics";
import { useMyDepartments } from "@/hooks/use-my-departments";
import { useDepartments } from "@/hooks/use-departments";

// Cache em memória (persiste entre navegações SPA — module-level)
type CasesMemoryCache = {
  institutionId: number;
  cases: BaserowCaseRow[];
  totalCount: number;
  nextPage: number | null;
  timestamp: number;
};

const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let casesMemoryCache: CasesMemoryCache | null = null;

// Cache em sessionStorage (persiste entre reloads completos)
type CachedCases = {
  cases: BaserowCaseRow[];
  timestamp: number;
  institutionId: number;
  totalCount: number;
};

const CASES_CACHE_KEY = "onboarding_cases_cache";
const CASES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getCasesFromCache = (institutionId: number): CachedCases | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CASES_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCases;
    if (cached.institutionId !== institutionId) return null;
    if (Date.now() - cached.timestamp > CASES_CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const setCasesCache = (institutionId: number, cases: BaserowCaseRow[], totalCount: number): void => {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCases = {
      cases,
      timestamp: Date.now(),
      institutionId,
      totalCount,
    };
    sessionStorage.setItem(CASES_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignora erros de storage
  }
};

type InstitutionOption = {
  id: string;
  label: string;
};

const parseDateInput = (value: string, options?: { endOfDay?: boolean }) => {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (options?.endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

export default function CasosPage() {
  const { data, isHydrated } = useOnboarding();
  const router = useRouter();
  const normalizedInstitutionId = useMemo(() => {
    const value = data.auth?.institutionId;
    if (value === undefined || value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data.auth?.institutionId]);

  // Hook para estatísticas server-side
  const {
    stats: serverStats,
    isLoading: statsLoading,
    isRefreshing: statsRefreshing,
    lastUpdated: statsLastUpdated,
    refresh: refreshStats,
    error: statsError,
  } = useStatistics(normalizedInstitutionId ?? undefined);

  const [cases, setCases] = useState<BaserowCaseRow[]>([]);
  const [selectedCase, setSelectedCase] = useState<BaserowCaseRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [updatingCaseId, setUpdatingCaseId] = useState<number | null>(null);
  const [pauseErrors, setPauseErrors] = useState<Record<number, string | null>>({});
  const [totalCasesCount, setTotalCasesCount] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(50); // Quantos casos exibir por vez
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const nextPageRef = useRef<number | null>(null); // próxima página a buscar (decrescente)
  const isSysAdmin = normalizedInstitutionId === 4;
  const [selectedInstitution, setSelectedInstitution] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<CaseStage | "all">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adminInstitutions, setAdminInstitutions] = useState<InstitutionOption[]>([]);
  const [activeView, setActiveView] = useState<"lista" | "kanban">("lista");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const {
    userDepartmentIds: myDeptIds,
    userId: myUserId,
    userName: myUserName,
    isGlobalAdmin: isMyGlobalAdmin,
    isOfficeAdmin: isMyOfficeAdmin,
    isLoading: isDeptLoading,
    departments: myDepartments,
  } = useMyDepartments();
  const { departments: allDepartments } = useDepartments(normalizedInstitutionId ?? undefined);

  // Permissões para criação de caso
  const authSignature = data.auth
    ? `${data.auth.institutionId}:${data.auth.legacyUserId ?? ""}`
    : null;
  const { isSysAdmin: permSysAdmin, isOfficeAdmin: permOfficeAdmin, enabledActions } = usePermissionsStatus(authSignature);
  const canCreateCase = permSysAdmin || permOfficeAdmin || isMyGlobalAdmin || isMyOfficeAdmin || enabledActions.includes("criar_caso");

  // Estado do modal de criação
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCasePhone, setNewCasePhone] = useState("");
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [createCaseError, setCreateCaseError] = useState<string | null>(null);
  // For the dropdown: sysAdmin sees all departments, others see their own
  const isFullAccessAdmin = isMyGlobalAdmin || isMyOfficeAdmin;
  const filterableDepartments = isFullAccessAdmin ? allDepartments : myDepartments;
  const normalizedStartDate = useMemo(
    () => parseDateInput(startDate),
    [startDate],
  );
  const normalizedEndDate = useMemo(
    () => parseDateInput(endDate, { endOfDay: true }),
    [endDate],
  );

  const caseInstitutionIds = useMemo(() => {
    if (!cases.length) return [];
    const unique = new Set<string>();
    cases.forEach((row) => {
      const normalizedId = getCaseInstitutionId(row);
      if (normalizedId) {
        unique.add(normalizedId);
      }
    });
    return Array.from(unique);
  }, [cases]);

  const institutionOptions = useMemo(() => {
    const sortOptions = (options: InstitutionOption[]) => {
      return options.sort((a, b) => {
        const numA = Number(a.id);
        const numB = Number(b.id);
        const isNumA = Number.isFinite(numA);
        const isNumB = Number.isFinite(numB);
        if (isNumA && isNumB) {
          return numA - numB;
        }
        if (isNumA) return -1;
        if (isNumB) return 1;
        return a.id.localeCompare(b.id);
      });
    };

    if (!isSysAdmin) {
      return sortOptions(
        caseInstitutionIds.map((id) => ({
          id,
          label: `Instituição #${id}`,
        })),
      );
    }

    const map = new Map<string, InstitutionOption>();
    adminInstitutions.forEach((option) => {
      map.set(option.id, option);
    });
    caseInstitutionIds.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, { id, label: `Instituição #${id}` });
      }
    });
    return sortOptions(Array.from(map.values()));
  }, [adminInstitutions, caseInstitutionIds, isSysAdmin]);

  const visibleCases = useMemo(() => {
    // Aguardar carregamento dos departamentos para não exibir casos indevidos
    // isSysAdmin é síncrono (localStorage), isFullAccessAdmin depende de API async
    if (!isSysAdmin && !isFullAccessAdmin && isDeptLoading) return [];

    let filteredCases = [...cases];

    // Filtro de visibilidade por departamento (não-sysAdmin)
    if (!isFullAccessAdmin && myDeptIds.length > 0) {
      filteredCases = filteredCases.filter((row) => {
        // Caso sem departamento → visível para todos (ainda não categorizado)
        if (!row.department_id) return true;
        // Caso pertence a um dos meus departamentos (Number() para evitar mismatch string/number do Baserow)
        const caseDeptId = Number(row.department_id);
        if (caseDeptId > 0 && myDeptIds.includes(caseDeptId)) return true;
        // Caso atribuído diretamente a mim (novo campo)
        if (row.assigned_to_user_id && myUserId && Number(row.assigned_to_user_id) === myUserId) return true;
        // Caso atribuído a mim (campo legado)
        if (myUserName && row.responsavel && row.responsavel === myUserName) return true;
        return false;
      });
    }

    // Filtro manual por departamento (dropdown UI)
    if (filterDepartment !== "all") {
      const deptId = Number(filterDepartment);
      filteredCases = filteredCases.filter(
        (row) => Number(row.department_id) === deptId,
      );
    }

    if (isSysAdmin && selectedInstitution !== "all") {
      filteredCases = filteredCases.filter(
        (row) => getCaseInstitutionId(row) === selectedInstitution,
      );
    }

    if (stageFilter !== "all") {
      filteredCases = filteredCases.filter(
        (row) => getCaseStage(row) === stageFilter,
      );
    }

    // Filtro por data
    if (normalizedStartDate || normalizedEndDate) {
      filteredCases = filteredCases.filter((row) => {
        if (!row.Data) return false;

        // Tenta converter a data do caso para um formato comparável
        // Suporta formatos: DD/MM/YYYY, YYYY-MM-DD, ou DD-MM-YYYY
        let caseDate: Date | null = null;
        const dataStr = row.Data.toString().trim();

        // Tenta formato DD/MM/YYYY ou DD-MM-YYYY
        const brMatch = dataStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (brMatch) {
          const [, day, month, year] = brMatch;
          caseDate = new Date(Number(year), Number(month) - 1, Number(day));
        } else {
          // Tenta formato ISO YYYY-MM-DD
          const isoMatch = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) {
            const [, year, month, day] = isoMatch;
            caseDate = new Date(Number(year), Number(month) - 1, Number(day));
          }
        }

        if (!caseDate || isNaN(caseDate.getTime())) return false;

        // Compara com as datas de filtro
        if (normalizedStartDate) {
          if (caseDate < normalizedStartDate) return false;
        }

        if (normalizedEndDate) {
          if (caseDate > normalizedEndDate) return false;
        }

        return true;
      });
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const numericQuery = normalizedQuery.replace(/\D/g, "");

    if (normalizedQuery) {
      filteredCases = filteredCases.filter((row) => {
        const matchesText = [
          row.CustumerName,
          row.CaseId,
          row.id,
          row.BJCaseId,
          row.CustumerPhone,
        ].some((value) => {
          if (value === null || value === undefined) {
            return false;
          }
          return value.toString().toLowerCase().includes(normalizedQuery);
        });

        let matchesPhoneDigits = false;
        if (numericQuery) {
          const phoneDigits = (row.CustumerPhone ?? "").replace(/\D/g, "");
          matchesPhoneDigits = phoneDigits.includes(numericQuery);
        }

        return matchesText || matchesPhoneDigits;
      });
    }

    // Dados já vêm ordenados (mais recentes primeiro)
    return filteredCases;
  }, [
    cases,
    isSysAdmin,
    isFullAccessAdmin,
    isDeptLoading,
    myDeptIds,
    myUserId,
    myUserName,
    filterDepartment,
    selectedInstitution,
    searchQuery,
    stageFilter,
    normalizedStartDate,
    normalizedEndDate,
  ]);

  // Casos visíveis na tela (paginação virtual)
  const paginatedCases = useMemo(() => {
    return visibleCases.slice(0, visibleCount);
  }, [visibleCases, visibleCount]);

  // Verifica se há mais casos para exibir (virtual) ou buscar (servidor)
  const hasMoreToShow = visibleCases.length > visibleCount;
  const hasMoreFromServer = nextPageRef.current !== null;
  const showSentinel = hasMoreToShow || hasMoreFromServer;

  // Calcular estatísticas localmente a partir dos casos carregados
  const localStats = useMemo(() => {
    return computeCaseStatistics(cases);
  }, [cases]);

  // Usa estatísticas do servidor se disponíveis, senão usa estatísticas locais
  const caseStats = useMemo(() => {
    // Se tem erro ou servidor retornou zeros mas temos casos, usa local
    if (statsError || (serverStats.totalCases === 0 && cases.length > 0)) {
      return localStats;
    }
    return serverStats;
  }, [serverStats, localStats, statsError, cases.length]);

  const selectedInstitutionLabel = useMemo(() => {
    if (selectedInstitution === "all") return null;
    const match = institutionOptions.find(
      (option) => option.id === selectedInstitution,
    );
    return match?.label ?? `Instituição #${selectedInstitution}`;
  }, [institutionOptions, selectedInstitution]);

  const summaryScopeDescription = useMemo(() => {
    if (isSysAdmin) {
      return selectedInstitution === "all"
        ? "Consolidado de todas as instituições."
        : selectedInstitutionLabel ?? `Instituição #${selectedInstitution}`;
    }
    return "Dados da sua instituição.";
  }, [isSysAdmin, selectedInstitution, selectedInstitutionLabel]);

  useEffect(() => {
    if (!isSysAdmin) {
      setAdminInstitutions([]);
      return;
    }

    let isMounted = true;

    const fetchInstitutions = async () => {
      try {
        const configs = await getBaserowConfigs();
        if (!isMounted) return;

        const unique = new Map<string, InstitutionOption>();
        configs.forEach((row: BaserowConfigRow) => {
          const normalizedId = getCaseInstitutionId(
            row as unknown as BaserowCaseRow,
          );
          if (!normalizedId) {
            return;
          }

          const companyName =
            typeof row["body.tenant.companyName"] === "string"
              ? row["body.tenant.companyName"].trim()
              : "";
          const label = companyName
            ? `${companyName} (#${normalizedId})`
            : `Instituição #${normalizedId}`;

          if (!unique.has(normalizedId)) {
            unique.set(normalizedId, { id: normalizedId, label });
          }
        });

        setAdminInstitutions(Array.from(unique.values()));
      } catch (err) {
        console.error("Erro ao carregar lista de instituições:", err);
      }
    };

    fetchInstitutions();

    return () => {
      isMounted = false;
    };
  }, [isSysAdmin]);

  useEffect(() => {
    if (!isSysAdmin) return;
    if (
      selectedInstitution !== "all" &&
      !institutionOptions.some((option) => option.id === selectedInstitution)
    ) {
      setSelectedInstitution("all");
    }
  }, [institutionOptions, isSysAdmin, selectedInstitution]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      casesMemoryCache = null;
      router.push("/");
      return;
    }
    if (normalizedInstitutionId === null) {
      return;
    }

    // 1. Cache em memória (navegação SPA — restauração instantânea)
    //    Exibe dados do cache imediatamente, mas sempre busca dados atualizados
    //    em background para refletir mudanças (ex: department_id alterado).
    if (
      casesMemoryCache &&
      casesMemoryCache.institutionId === normalizedInstitutionId &&
      Date.now() - casesMemoryCache.timestamp < MEMORY_CACHE_TTL_MS
    ) {
      setCases(casesMemoryCache.cases);
      setTotalCasesCount(casesMemoryCache.totalCount);
      nextPageRef.current = casesMemoryCache.nextPage;
      setIsLoading(false);
      loadCases(true);
      return;
    }

    // 2. Cache em sessionStorage (reload completo)
    const cached = getCasesFromCache(normalizedInstitutionId);
    if (cached) {
      setCases(cached.cases);
      setTotalCasesCount(cached.totalCount);
      setIsLoading(false);
      loadCases(true);
    } else {
      loadCases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth, normalizedInstitutionId]);

  // Sincronizar estado → cache em memória
  useEffect(() => {
    if (normalizedInstitutionId !== null && cases.length > 0) {
      casesMemoryCache = {
        institutionId: normalizedInstitutionId,
        cases,
        totalCount: totalCasesCount ?? cases.length,
        nextPage: nextPageRef.current,
        timestamp: Date.now(),
      };
    }
  }, [cases, totalCasesCount, normalizedInstitutionId]);

  const PAGE_SIZE = 200;
  const INITIAL_MAX_PAGES = 3;

  const sortDesc = useCallback(
    (arr: BaserowCaseRow[]) => [...arr].sort((a, b) => (b.id || 0) - (a.id || 0)),
    [],
  );

  const loadCases = async (silent: boolean = false) => {
    if (!Number.isFinite(normalizedInstitutionId)) {
      setError("ID da instituicao nao encontrado");
      setIsLoading(false);
      return;
    }

    const institutionId = normalizedInstitutionId!;

    try {
      if (!silent) {
        setIsLoading(true);
        setCases([]);
        setError(null);
        nextPageRef.current = null;
        casesMemoryCache = null;
      }

      const response = await getBaserowCases({
        institutionId,
        pageSize: PAGE_SIZE,
        fetchAll: true,
        newestFirst: true,
        maxPages: INITIAL_MAX_PAGES,
        onPageLoaded: (partial, total) => {
          setCases(sortDesc(partial));
          setTotalCasesCount(total);
          if (!silent) setIsLoading(false);
        },
      });

      const sortedResults = sortDesc(response.results);
      setCases(sortedResults);
      setTotalCasesCount(response.totalCount);

      // Calcular próxima página a buscar (indo de trás para frente)
      if (response.hasNextPage) {
        const totalPages = Math.ceil(response.totalCount / PAGE_SIZE);
        const pageBudget = INITIAL_MAX_PAGES - 1; // pages fetched from the end
        nextPageRef.current = totalPages - pageBudget;
      } else {
        nextPageRef.current = null;
        setCasesCache(institutionId, sortedResults, response.totalCount);
      }

      // Auto-assign unassigned cases (fire-and-forget)
      fetch("/api/v1/cases/auto-assign", { method: "POST" }).catch(() => {});
    } catch (err) {
      if (!silent) {
        console.error("Erro ao carregar casos:", err);
        setError(
          err instanceof Error ? err.message : "Erro ao carregar casos",
        );
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  // Buscar mais páginas do Baserow (scroll infinito)
  const loadMoreFromServer = useCallback(async () => {
    if (isLoadingMore || nextPageRef.current === null || nextPageRef.current < 1) return;
    if (!Number.isFinite(normalizedInstitutionId)) return;

    setIsLoadingMore(true);

    try {
      const startPage = nextPageRef.current;
      const endPage = Math.max(1, startPage - 2); // até 3 páginas por vez
      const pagesToFetch: number[] = [];
      for (let p = startPage; p >= endPage; p--) {
        pagesToFetch.push(p);
      }

      const results = await Promise.all(
        pagesToFetch.map((p) =>
          getBaserowCases({
            institutionId: normalizedInstitutionId!,
            page: p,
            pageSize: PAGE_SIZE,
          }),
        ),
      );

      const newCases = results.flatMap((r) => r.results);
      setCases((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const unique = newCases.filter((c) => !existingIds.has(c.id));
        return [...prev, ...unique].sort((a, b) => (b.id || 0) - (a.id || 0));
      });

      nextPageRef.current = endPage > 1 ? endPage - 1 : null;

      // Se carregou tudo, salvar no cache
      if (nextPageRef.current === null) {
        setCases((prev) => {
          setCasesCache(normalizedInstitutionId!, prev, totalCasesCount ?? prev.length);
          return prev;
        });
      }
    } catch (err) {
      console.error("Erro ao carregar mais casos:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, normalizedInstitutionId, totalCasesCount, sortDesc]);

  // Função para mostrar mais casos (paginação virtual)
  const showMoreCases = useCallback(() => {
    setVisibleCount((prev) => prev + 50);
  }, []);

  // Ref para o elemento sentinela do infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll com IntersectionObserver (virtual + server)
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          if (hasMoreToShow) {
            showMoreCases();
          } else if (hasMoreFromServer && !isLoadingMore) {
            loadMoreFromServer();
          }
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreToShow, hasMoreFromServer, isLoadingMore, showMoreCases, loadMoreFromServer]);

  // Resetar visibleCount quando filtros mudam
  useEffect(() => {
    setVisibleCount(50);
  }, [selectedInstitution, searchQuery, stageFilter, filterDepartment, normalizedStartDate, normalizedEndDate]);

  const handleCaseClick = (caseRow: BaserowCaseRow) => {
    setSelectedCase(caseRow);
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedCase(null);
    }
  };

  const handleToggleIAPause = async (
    caseRow: BaserowCaseRow | null,
    enabled: boolean,
  ) => {
    if (!caseRow) return;
    setPauseErrors((prev) => ({ ...prev, [caseRow.id]: null }));
    setUpdatingCaseId(caseRow.id);
    try {
      const payload = enabled ? { IApause: "SIM" } : { IApause: "" };
      const updatedCase = await updateBaserowCase(caseRow.id, payload);

      setCases((prevCases) =>
        prevCases.map((row) =>
          row.id === caseRow.id ? { ...row, ...payload, ...updatedCase } : row,
        ),
      );

      setSelectedCase((prevCase) =>
        prevCase && prevCase.id === caseRow.id
          ? { ...prevCase, ...payload, ...updatedCase }
          : prevCase,
      );
    } catch (err) {
      setPauseErrors((prev) => ({
        ...prev,
        [caseRow.id]:
          err instanceof Error ? err.message : "Erro ao atualizar IApause",
      }));
    } finally {
      setUpdatingCaseId(null);
    }
  };

  const handleCreateCase = async () => {
    const trimmedName = newCaseName.trim();
    const trimmedPhone = newCasePhone.trim();
    if (!trimmedName || !trimmedPhone) return;

    setIsCreatingCase(true);
    setCreateCaseError(null);

    try {
      const res = await fetch("/api/v1/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: trimmedName,
          customerPhone: trimmedPhone,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }

      // Fechar modal, limpar campos e recarregar lista
      setIsCreateModalOpen(false);
      setNewCaseName("");
      setNewCasePhone("");
      casesMemoryCache = null;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(CASES_CACHE_KEY);
      }
      loadCases();
    } catch (err) {
      setCreateCaseError(
        err instanceof Error ? err.message : "Erro ao criar caso",
      );
    } finally {
      setIsCreatingCase(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando casos..." />;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Erro</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => loadCases()}>Tentar Novamente</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-2 sm:py-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:gap-4 px-3 sm:px-4">
        {/* Header: tabs + stats */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          {/* View Tabs + Novo Caso */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant={activeView === "lista" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("lista")}
                className="gap-1.5 h-8"
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </Button>
              <Button
                variant={activeView === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("kanban")}
                className="gap-1.5 h-8"
              >
                <Kanban className="h-3.5 w-3.5" />
                Kanban
              </Button>
            </div>
            {canCreateCase && (
              <Button
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => {
                  setCreateCaseError(null);
                  setIsCreateModalOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Novo Caso</span>
              </Button>
            )}
          </div>

          {/* Estatísticas compactas - desktop only inline */}
          <div className="hidden sm:flex items-center gap-3 sm:ml-auto overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">Total:</span>
                <span className="text-sm font-bold text-primary">
                  {statsLoading && caseStats.totalCases === 0 ? "..." : (caseStats.totalCases || totalCasesCount || "...")}
                </span>
              </div>
              {stageOrder.map((stage) => (
                <div key={stage} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">{stageLabels[stage]}:</span>
                  <span className={cn("text-sm font-semibold", stageColors[stage].replace("bg-", "text-").replace("-100", "-700").replace("-900", "-300"))}>
                    {statsLoading && caseStats.stageCounts[stage] === 0 ? "..." : caseStats.stageCounts[stage]}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-md border border-dashed bg-card px-3 py-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">IA Pausada:</span>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {statsLoading && caseStats.pausedCases === 0 ? "..." : caseStats.pausedCases}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 shrink-0"
                onClick={() => refreshStats()}
                disabled={statsRefreshing}
                title={statsLastUpdated ? `Atualizado: ${statsLastUpdated.toLocaleTimeString("pt-BR")}` : "Atualizar estatísticas"}
              >
                {statsRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {statsLastUpdated && (
                  <span className="text-xs text-muted-foreground">
                    {statsLastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-8 shrink-0">
                <Link href="/estatisticas">Ver mais</Link>
              </Button>
            {statsError && cases.length === 0 && (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded shrink-0" title={statsError}>
                {statsError}
              </span>
            )}
          </div>
        </div>

        {/* Filtros + Stats mobile na mesma linha */}
        <div className="space-y-3 pb-3 sm:space-y-4 sm:pb-4">
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            {/* Stats card mobile - mesma linha do filtros */}
            <div className="flex items-center gap-1.5 sm:hidden">
              <div className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 shrink-0">
                <span className="text-[11px] text-muted-foreground">Total:</span>
                <span className="text-xs font-bold text-primary">
                  {statsLoading && caseStats.totalCases === 0 ? "..." : (caseStats.totalCases || totalCasesCount || "...")}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => refreshStats()}
                disabled={statsRefreshing}
                title="Atualizar estatísticas"
              >
                {statsRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-7 px-1.5 shrink-0">
                <Link href="/estatisticas">
                  <span className="text-[11px]">Ver mais</span>
                </Link>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="sm:hidden gap-1.5"
                onClick={() => setFiltersExpanded((v) => !v)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
              </Button>
              <Button variant="outline" size="sm" onClick={() => loadCases()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Busca sempre visível */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cases-search"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sr-only sm:not-sr-only"
            >
              Buscar casos
            </label>
            <Input
              id="cases-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por nome, ID ou telefone..."
              className="w-full"
            />
          </div>
          {/* Filtros extras - colapsáveis no mobile */}
          <div className={cn(
            "grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7",
            filtersExpanded ? "grid" : "hidden sm:grid"
          )}>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="stage-filter"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Etapa
              </label>
              <select
                id="stage-filter"
                value={stageFilter}
                onChange={(event) =>
                  setStageFilter(event.target.value as CaseStage | "all")
                }
                className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="all">Todas</option>
                {stageOrder.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabels[stage]}
                  </option>
                ))}
              </select>
            </div>
            {isHydrated && (
              <>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="start-date"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Data inicial
                  </label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="end-date"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Data final
                  </label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full"
                  />
                </div>
              </>
            )}
            {isSysAdmin && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="institution-filter"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Instituição
                </label>
                <select
                  id="institution-filter"
                  value={selectedInstitution}
                  onChange={(event) => setSelectedInstitution(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="all">Todas</option>
                  {institutionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterableDepartments.length > 0 && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="department-filter"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Departamento
                </label>
                <select
                  id="department-filter"
                  value={filterDepartment}
                  onChange={(event) => setFilterDepartment(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="all">Todos</option>
                  {filterableDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {activeView === "kanban" ? (
          <div className="min-h-[600px]">
            <KanbanView
              cases={visibleCases}
              institutionId={normalizedInstitutionId!}
              departmentId={filterDepartment !== "all" ? Number(filterDepartment) : null}
              onRefresh={() => loadCases()}
              onCaseUpdate={(caseId, updates) => {
                setCases((prev) =>
                  prev.map((c) => (c.id === caseId ? { ...c, ...updates } : c))
                );
              }}
            />
          </div>
        ) : (
          <>
            <div>
              {visibleCases.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  Nenhum caso encontrado.
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedCases.map((caseRow) => {
                    const stage = getCaseStage(caseRow);
                    const isPaused = isCasePaused(caseRow);
                    const pauseError = pauseErrors[caseRow.id];
                    return (
                      <div
                        key={caseRow.id}
                        onClick={() => handleCaseClick(caseRow)}
                        className="cursor-pointer border-b border-[#7E99B5] dark:border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors hover:bg-accent/50 active:bg-accent/70"
                      >
                        {/* Mobile: 2 linhas, Desktop: 1 linha */}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-semibold truncate max-w-[55vw] sm:max-w-[200px]">
                              {caseRow.CustumerName || "Sem nome"}
                            </h3>
                            {stage && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0",
                                  stageColors[stage],
                                )}
                              >
                                {stageLabels[stage]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:ml-auto">
                            {caseRow.Data && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {caseRow.Data}
                              </span>
                            )}
                            <Link
                              href={`/chat?case=${caseRow.id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-900/30 dark:text-blue-200 whitespace-nowrap"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MessageSquareText className="h-3 w-3" />
                              Chat
                            </Link>
                            <div
                              className="flex items-center gap-1 ml-auto sm:ml-0"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground hidden sm:inline">
                                Pausar IA
                              </span>
                              <Switch
                                checked={isPaused}
                                onCheckedChange={(checked) =>
                                  handleToggleIAPause(caseRow, checked)
                                }
                                disabled={updatingCaseId === caseRow.id}
                                aria-label="Alternar pausa da IA neste caso"
                              />
                            </div>
                          </div>
                        </div>
                        {pauseError && (
                          <p className="text-xs text-destructive mt-1">
                            {pauseError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Sentinela para infinite scroll (virtual + server) */}
              {showSentinel && (
                <div ref={loadMoreRef} className="py-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando mais...</span>
                  </div>
                </div>
              )}
              {!showSentinel && visibleCases.length > 0 && (
                <div className="py-4 text-center text-muted-foreground text-sm">
                  Exibindo {paginatedCases.length} de {totalCasesCount ?? cases.length} atendimentos
                </div>
              )}
            </div>

            <KanbanCardDetail
              caseData={selectedCase}
              open={isDialogOpen}
              onOpenChange={handleDialogOpenChange}
              onCaseUpdate={(caseId, updates) => {
                setCases((prev) =>
                  prev.map((c) => (c.id === caseId ? { ...c, ...updates } : c))
                );
              }}
            />
          </>
        )}
      </div>

      {/* Modal de criação de caso */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Caso</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente para criar um novo caso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-case-name" className="text-sm font-medium">
                Nome do cliente *
              </label>
              <Input
                id="new-case-name"
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                placeholder="Nome completo"
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-case-phone" className="text-sm font-medium">
                Telefone *
              </label>
              <Input
                id="new-case-phone"
                value={newCasePhone}
                onChange={(e) => setNewCasePhone(e.target.value)}
                placeholder="(00) 00000-0000"
                maxLength={50}
              />
            </div>
            {createCaseError && (
              <p className="text-sm text-destructive">{createCaseError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isCreatingCase}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateCase}
              disabled={isCreatingCase || !newCaseName.trim() || !newCasePhone.trim()}
            >
              {isCreatingCase ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Criando...
                </>
              ) : (
                "Criar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

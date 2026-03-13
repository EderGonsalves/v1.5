"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MovementTimeline } from "./MovementTimeline";
import {
  Scale,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  StopCircle,
  XCircle,
  StickyNote,
  Save,
} from "lucide-react";
import { updateBaserowCase } from "@/services/api";
import {
  fetchTrackingByCaseId,
  startMonitoring,
  toggleTracking,
  deleteTracking,
  fetchMovements,
  queryAndWait,
} from "@/services/lawsuit-client";
import type { LawsuitTracking, LawsuitMovement } from "@/services/lawsuit";

type LawsuitTabProps = {
  caseId: number;
  institutionId: number;
  initialCnj?: string;
  initialTrackingActive?: boolean;
  initialNotes?: string;
  onNotesChange?: (notes: string) => void;
  onTrackingActiveChange?: (active: boolean) => void;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  monitoring: {
    label: "Monitorando",
    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    icon: CheckCircle,
  },
  pending: {
    label: "Pendente",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    icon: Clock,
  },
  error: {
    label: "Erro",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    icon: AlertCircle,
  },
  stopped: {
    label: "Parado",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: StopCircle,
  },
};

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

function formatCnj(value: string): string {
  const digits = value.replace(/\D/g, "");
  let formatted = "";
  for (let i = 0; i < digits.length && i < 20; i++) {
    if (i === 7) formatted += "-";
    if (i === 9) formatted += ".";
    if (i === 13) formatted += ".";
    if (i === 14) formatted += ".";
    if (i === 16) formatted += ".";
    formatted += digits[i];
  }
  return formatted;
}

export function LawsuitTab({
  caseId,
  institutionId,
  initialCnj,
  initialTrackingActive,
  initialNotes,
  onNotesChange,
  onTrackingActiveChange,
}: LawsuitTabProps) {
  const [tracking, setTracking] = useState<LawsuitTracking | null>(null);
  const [movements, setMovements] = useState<LawsuitMovement[]>([]);
  const [movementsCount, setMovementsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [queryProgress, setQueryProgress] = useState("");
  const [cnjInput, setCnjInput] = useState(initialCnj || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState(initialNotes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Estado de acompanhamento ativo (campo do caso, independente do tracking Codilo)
  const [isTrackingActive, setIsTrackingActive] = useState(initialTrackingActive ?? false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Load tracking data
  const loadTracking = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const trackings = await fetchTrackingByCaseId(caseId);
      // Pick the active or most recent tracking
      const active = trackings.find((t) => t.is_active === "true") || trackings[0] || null;
      setTracking(active);

      if (active) {
        setCnjInput(active.cnj);
        loadMovements(active.id);
      }
    } catch (err) {
      console.error("[LawsuitTab] Error loading tracking:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  const loadMovements = async (trackingId: number) => {
    try {
      setIsLoadingMovements(true);
      const result = await fetchMovements(trackingId, { page: 1, size: 50 });
      setMovements(result.results);
      setMovementsCount(result.count);
    } catch (err) {
      console.error("[LawsuitTab] Error loading movements:", err);
    } finally {
      setIsLoadingMovements(false);
    }
  };

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  // Toggle acompanhamento ativo (campo do caso — independe de CNJ)
  const handleToggleActive = async (active: boolean) => {
    try {
      setIsTogglingActive(true);
      setError("");
      await updateBaserowCase(caseId, {
        lawsuit_tracking_active: active ? "true" : "false",
      });
      setIsTrackingActive(active);
      onTrackingActiveChange?.(active);

      // Se tem tracking Codilo, sincronizar o toggle
      if (tracking) {
        try {
          const updated = await toggleTracking(tracking.id, active);
          setTracking(updated);
        } catch {
          // Não bloquear — o campo do caso já foi atualizado
        }
      }
    } catch (err) {
      console.error("[LawsuitTab] Error toggling active:", err);
      setError(err instanceof Error ? err.message : "Erro ao alternar");
    } finally {
      setIsTogglingActive(false);
    }
  };

  // Start monitoring (requer CNJ válido)
  const handleStartMonitoring = async () => {
    const cnj = cnjInput.trim();
    if (!CNJ_REGEX.test(cnj)) {
      setError("Formato CNJ inválido. Esperado: NNNNNNN-DD.AAAA.J.TR.OOOO");
      return;
    }

    try {
      setIsStarting(true);
      setError("");
      const result = await startMonitoring(caseId, cnj, institutionId);
      setTracking(result);
      // Ativar acompanhamento automaticamente ao iniciar monitoramento
      if (!isTrackingActive) {
        setIsTrackingActive(true);
        onTrackingActiveChange?.(true);
      }
    } catch (err) {
      console.error("[LawsuitTab] Error starting monitoring:", err);
      setError(err instanceof Error ? err.message : "Erro ao iniciar monitoramento");
    } finally {
      setIsStarting(false);
    }
  };

  // Toggle Codilo tracking active (quando já existe tracking)
  const handleToggleCodilo = async (active: boolean) => {
    if (!tracking) return;
    try {
      setIsToggling(true);
      setError("");
      const updated = await toggleTracking(tracking.id, active);
      setTracking(updated);
    } catch (err) {
      console.error("[LawsuitTab] Error toggling:", err);
      setError(err instanceof Error ? err.message : "Erro ao alternar");
    } finally {
      setIsToggling(false);
    }
  };

  // Query (consulta avulsa) with polling
  const handleQuery = async () => {
    if (!tracking) return;
    try {
      setIsQuerying(true);
      setError("");
      setQueryProgress("Enviando consulta...");

      const result = await queryAndWait(tracking.id, (status) => {
        setQueryProgress(status);
      });

      if (result.status === "completed") {
        setQueryProgress(`Concluído! ${result.created ?? 0} movimentação(ões) encontrada(s).`);
        await loadTracking();
      } else if (result.status === "timeout") {
        setQueryProgress("A consulta ainda está processando. Tente atualizar em alguns segundos.");
      }

      setTimeout(() => setQueryProgress(""), 5000);
    } catch (err) {
      console.error("[LawsuitTab] Error querying:", err);
      setError(err instanceof Error ? err.message : "Erro ao consultar");
      setQueryProgress("");
    } finally {
      setIsQuerying(false);
    }
  };

  // Save notes
  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      await updateBaserowCase(caseId, { notas_caso: notes });
      onNotesChange?.(notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } catch (err) {
      console.error("[LawsuitTab] Error saving notes:", err);
      setError(err instanceof Error ? err.message : "Erro ao salvar notas");
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!tracking) return;
    try {
      setIsDeleting(true);
      setError("");
      await deleteTracking(tracking.id);
      setTracking(null);
      setMovements([]);
      setMovementsCount(0);
      setCnjInput("");
      setConfirmDelete(false);
    } catch (err) {
      console.error("[LawsuitTab] Error deleting:", err);
      setError(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCodilo = tracking !== null;
  const codiloStatusConfig = hasCodilo
    ? STATUS_CONFIG[tracking.status] || STATUS_CONFIG.pending
    : null;
  const CodiloStatusIcon = codiloStatusConfig?.icon;
  const isCodiloActive = hasCodilo && tracking.is_active === "true";

  return (
    <div className="space-y-4">
      {/* Toggle principal do acompanhamento */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">Acompanhamento Processual</h3>
          </div>
          {hasCodilo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTracking}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Toggle ativar/desativar acompanhamento */}
        <div className="flex items-center gap-3 pb-4 border-b mb-4">
          <Switch
            checked={isTrackingActive}
            onCheckedChange={handleToggleActive}
            disabled={isTogglingActive}
          />
          <div className="flex-1">
            <span className={`text-sm font-medium ${isTrackingActive ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
              {isTrackingActive ? "Acompanhamento Ativo" : "Acompanhamento Inativo"}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isTrackingActive
                ? "O agente utilizará as informações do processo nas conversas"
                : "Ative para que o agente acompanhe este caso"}
            </p>
          </div>
          {isTogglingActive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* CNJ + Monitoramento Codilo */}
        {hasCodilo ? (
          /* Tracking Codilo existe — mostrar status completo */
          <>
            <div className="grid grid-cols-2 gap-4">
              {/* CNJ */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Número CNJ
                </Label>
                <p className="text-sm font-mono font-medium">{tracking.cnj}</p>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Status Codilo
                </Label>
                <div className="flex items-center gap-2">
                  {codiloStatusConfig && CodiloStatusIcon && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full ${codiloStatusConfig.color}`}>
                      <CodiloStatusIcon className="h-3 w-3" />
                      {codiloStatusConfig.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle Codilo */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Monitoramento CNJ
                </Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isCodiloActive}
                    onCheckedChange={handleToggleCodilo}
                    disabled={isToggling}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isCodiloActive ? "Ativo" : "Inativo"}
                  </span>
                  {isToggling && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
              </div>

              {/* Movements count */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Movimentações
                </Label>
                <p className="text-sm font-medium">{tracking.movements_count || 0}</p>
              </div>

              {/* Error message */}
              {tracking.error_message && (
                <div className="col-span-2">
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {tracking.error_message}
                  </div>
                </div>
              )}

              {/* Last update */}
              {tracking.last_update_at && (
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Última Atualização
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tracking.last_update_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuery}
                disabled={isQuerying || !isCodiloActive}
              >
                {isQuerying ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1.5" />
                )}
                Consultar Agora
              </Button>

              {!confirmDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Remover
                </Button>
              ) : (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Confirmar remoção?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Sim"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Não
                  </Button>
                </div>
              )}
            </div>

            {queryProgress && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2">
                {isQuerying && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
                {!isQuerying && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
                {queryProgress}
              </div>
            )}
          </>
        ) : (
          /* Sem tracking Codilo — formulário para adicionar CNJ (opcional) */
          <div className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Número CNJ (opcional)
              </Label>
              <Input
                value={cnjInput}
                onChange={(e) => {
                  setCnjInput(formatCnj(e.target.value));
                  setError("");
                }}
                placeholder="0000000-00.0000.0.00.0000"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Se informado, o sistema monitora movimentações automaticamente via Codilo
              </p>
            </div>

            <Button
              onClick={handleStartMonitoring}
              disabled={isStarting || !cnjInput.trim()}
              variant="outline"
              size="sm"
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Iniciar Monitoramento CNJ
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Notes + Movements (sempre visível) */}
      <div className="rounded-lg border bg-card p-5 space-y-5">
        {/* Case Notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Instruções Adicionais
            </Label>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
            placeholder="Anotações sobre o processo... O agente utilizará estas informações quando o acompanhamento estiver ativo."
            className="min-h-[100px] resize-y"
          />
          <div className="flex items-center justify-end mt-2">
            <Button
              variant={notesSaved ? "outline" : "default"}
              size="sm"
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className={notesSaved ? "bg-green-50 border-green-500 text-green-700" : ""}
            >
              {isSavingNotes ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : notesSaved ? (
                <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              {notesSaved ? "Salvo!" : "Salvar Notas"}
            </Button>
          </div>
        </div>

        {/* Movements Timeline (só exibe se tem tracking Codilo) */}
        {hasCodilo && (
          <>
            <div className="border-t" />
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-base">
                  Movimentações {movementsCount > 0 && `(${movementsCount})`}
                </h3>
              </div>
              <MovementTimeline movements={movements} isLoading={isLoadingMovements} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

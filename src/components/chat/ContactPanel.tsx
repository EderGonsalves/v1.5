"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  User,
  Phone,
  Calendar,
  Briefcase,
  Loader2,
  Check,
  Pencil,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBaserowCaseById,
  getKanbanColumns,
  searchClientByPhone,
  updateBaserowCase,
  updateClient,
  upsertCaseKanbanStatus,
  type BaserowCaseRow,
  type ClientRow,
} from "@/services/api";
import { getCaseStage, stageLabels, stageColors } from "@/lib/case-stats";
import { cn } from "@/lib/utils";

type ContactPanelProps = {
  caseRowId: number;
  customerName: string;
  customerPhone: string;
  institutionId: number;
  onClose: () => void;
  onOpenCaseDetail: (caseData: BaserowCaseRow) => void;
};

export function ContactPanel({
  caseRowId,
  customerName,
  customerPhone,
  institutionId,
  onClose,
  onOpenCaseDetail,
}: ContactPanelProps) {
  const [caseData, setCaseData] = useState<BaserowCaseRow | null>(null);
  const [clientData, setClientData] = useState<ClientRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(customerName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Finish case
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [fetchedCase, fetchedClient] = await Promise.all([
          getBaserowCaseById(caseRowId),
          customerPhone && institutionId
            ? searchClientByPhone(customerPhone, institutionId)
            : Promise.resolve(null),
        ]);

        if (!active) return;

        setCaseData(fetchedCase);
        setClientData(fetchedClient);

        if (fetchedCase?.CustumerName) {
          setNameValue(fetchedCase.CustumerName);
        }
      } catch (err) {
        console.error("Erro ao carregar dados do contato:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [caseRowId, customerPhone, institutionId]);

  const handleSaveName = useCallback(async () => {
    if (!nameValue.trim() || !caseData) return;

    setIsSavingName(true);
    try {
      await updateBaserowCase(caseRowId, { CustumerName: nameValue.trim() });

      if (clientData?.id) {
        await updateClient(clientData.id, {
          nome_completo: nameValue.trim(),
        });
      }

      setCaseData((prev) =>
        prev ? { ...prev, CustumerName: nameValue.trim() } : prev,
      );
      setIsEditingName(false);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      console.error("Erro ao salvar nome:", err);
    } finally {
      setIsSavingName(false);
    }
  }, [nameValue, caseData, caseRowId, clientData?.id]);

  const handleFinishCase = useCallback(async () => {
    if (!caseData) return;

    setIsFinishing(true);
    try {
      await updateBaserowCase(caseData.id, { resultado: "ganho" });

      const columns = await getKanbanColumns(institutionId);
      const ganhoColumn = columns.find(
        (c) => c.name === "Concluidos Ganhos",
      );

      if (ganhoColumn) {
        await upsertCaseKanbanStatus(
          caseData.id,
          institutionId,
          ganhoColumn.id,
          "chat",
          "Caso finalizado pelo chat",
        );
      }

      setCaseData((prev) =>
        prev ? { ...prev, resultado: "ganho" } : prev,
      );
    } catch (err) {
      console.error("Erro ao finalizar caso:", err);
      alert("Erro ao finalizar o caso. Tente novamente.");
    } finally {
      setIsFinishing(false);
    }
  }, [caseData, institutionId]);

  const stage = caseData ? getCaseStage(caseData) : null;
  const isPaused = (caseData?.IApause || "").toLowerCase() === "sim";

  return (
    <div className="flex h-full w-full flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Informações do contato</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-[#1B263B] dark:text-[#D4E0EB] hover:bg-[#D4E0EB] dark:hover:bg-[#263850] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center gap-3 border-b px-4 py-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>

            {isEditingName ? (
              <div className="flex w-full items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setIsEditingName(false);
                      setNameValue(
                        caseData?.CustumerName || customerName,
                      );
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                >
                  {isSavingName ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setIsEditingName(false);
                    setNameValue(
                      caseData?.CustumerName || customerName,
                    );
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="group flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors"
              >
                <span className="text-base font-semibold text-foreground">
                  {caseData?.CustumerName || customerName}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {nameSaved && (
              <span className="text-xs text-emerald-600">Nome salvo!</span>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-1 border-b px-4 py-4">
            <div className="flex items-center gap-3 py-1.5">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm text-foreground">
                  {customerPhone || "Sem telefone"}
                </p>
                <p className="text-[11px] text-muted-foreground">Telefone</p>
              </div>
            </div>

            {clientData?.email && (
              <div className="flex items-center gap-3 py-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground text-xs">@</span>
                <div>
                  <p className="text-sm text-foreground">{clientData.email}</p>
                  <p className="text-[11px] text-muted-foreground">E-mail</p>
                </div>
              </div>
            )}

            {clientData?.cpf && (
              <div className="flex items-center gap-3 py-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground text-xs font-bold">#</span>
                <div>
                  <p className="text-sm text-foreground">{clientData.cpf}</p>
                  <p className="text-[11px] text-muted-foreground">CPF</p>
                </div>
              </div>
            )}
          </div>

          {/* Case Info */}
          <div className="space-y-3 border-b px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Caso
            </p>

            <div className="flex items-center gap-3">
              <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-mono text-foreground">
                #{caseData?.CaseId || caseData?.id || caseRowId}
              </span>
            </div>

            {stage && (
              <div className="flex items-center gap-3">
                <span className="h-4 w-4" />
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    stageColors[stage],
                  )}
                >
                  {stageLabels[stage]}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="h-4 w-4" />
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  isPaused
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
                )}
              >
                IA {isPaused ? "Pausada" : "Ativa"}
              </span>
            </div>

            {caseData?.Data && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-foreground">{caseData.Data}</span>
              </div>
            )}

            {caseData?.responsavel && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">
                    {caseData.responsavel}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Responsável
                  </p>
                </div>
              </div>
            )}

            {caseData?.BJCaseId && (
              <a
                href={`https://app.riasistemas.com.br/case/edit/${caseData.BJCaseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline font-medium pt-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir caso no BJ
              </a>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 px-4 py-4">
            {caseData?.resultado === "ganho" ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-800 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Caso finalizado (Ganho)
                </span>
              </div>
            ) : caseData?.resultado === "perdido" ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-900/30">
                <CheckCircle2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Caso finalizado (Perdido)
                </span>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                onClick={handleFinishCase}
                disabled={isFinishing || !caseData}
              >
                {isFinishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Finalizar caso
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                if (caseData) {
                  onOpenCaseDetail(caseData);
                }
              }}
              disabled={!caseData}
            >
              <Briefcase className="h-4 w-4" />
              Ver detalhes do caso
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

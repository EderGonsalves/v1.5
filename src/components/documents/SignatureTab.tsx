"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PenLine, Plus, Loader2 } from "lucide-react";
import { EnvelopeCard } from "./EnvelopeCard";
import { DocumentEditorDialog } from "./DocumentEditorDialog";
import type { SignEnvelopeRow } from "@/lib/documents/types";
import type { BaserowCaseRow, ClientRow } from "@/services/api";
import {
  fetchEnvelopesByCaseId,
  refreshEnvelopeStatus,
  downloadSignedPdf,
} from "@/services/riasign-client";

type SignatureTabProps = {
  caseId: number;
  institutionId: number;
  caseData: BaserowCaseRow;
  clientData?: ClientRow | null;
};

export function SignatureTab({
  caseId,
  institutionId,
  caseData,
  clientData,
}: SignatureTabProps) {
  const [envelopes, setEnvelopes] = useState<SignEnvelopeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadEnvelopes = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      const data = await fetchEnvelopesByCaseId(caseId);
      setEnvelopes(data);
    } catch {
      // Silent fail — empty list shown
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadEnvelopes();
  }, [loadEnvelopes]);

  // Auto-polling: atualiza a cada 15s enquanto houver envelopes em status ativo
  const POLL_INTERVAL = 15_000;
  const TERMINAL_STATUSES = useRef(new Set(["completed", "declined", "expired"]));

  useEffect(() => {
    const hasActive = envelopes.some(
      (e) => !TERMINAL_STATUSES.current.has(e.status),
    );
    if (!hasActive || envelopes.length === 0) return;

    let timerId: ReturnType<typeof setTimeout>;
    let unmounted = false;

    const tick = async () => {
      if (unmounted) return;
      try {
        await loadEnvelopes(false);
      } catch { /* silent */ }
      if (!unmounted) {
        timerId = setTimeout(tick, POLL_INTERVAL);
      }
    };

    timerId = setTimeout(tick, POLL_INTERVAL);
    return () => { unmounted = true; clearTimeout(timerId); };
  }, [envelopes, loadEnvelopes]);

  const handleRefresh = async (envelope: SignEnvelopeRow) => {
    setRefreshingId(envelope.id);
    try {
      const updated = await refreshEnvelopeStatus(envelope.id);
      setEnvelopes((prev) =>
        prev.map((e) => (e.id === envelope.id ? updated : e)),
      );
    } catch {
      // Silent fail
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDownload = async (envelope: SignEnvelopeRow) => {
    try {
      const blob = await downloadSignedPdf(envelope.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${envelope.subject}_assinado.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao baixar");
    }
  };

  const handleEnvelopeCreated = (envelope: SignEnvelopeRow) => {
    setEnvelopes((prev) => [envelope, ...prev]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Documentos e Assinaturas
        </p>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Gerar Documento
        </button>
      </div>

      {/* Envelope list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : envelopes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <PenLine className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            Nenhum documento enviado para assinatura
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {envelopes.map((env) => (
            <EnvelopeCard
              key={env.id}
              envelope={env}
              onRefresh={handleRefresh}
              onDownload={handleDownload}
              refreshing={refreshingId === env.id}
            />
          ))}
        </div>
      )}

      {/* Document editor dialog */}
      <DocumentEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        caseData={caseData}
        clientData={clientData}
        institutionId={institutionId}
        onEnvelopeCreated={handleEnvelopeCreated}
      />
    </div>
  );
}

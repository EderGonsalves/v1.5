"use client";

import { useState } from "react";
import { Download, RefreshCw, Copy, ExternalLink, Check } from "lucide-react";
import { EnvelopeStatusBadge } from "./EnvelopeStatusBadge";
import type { SignEnvelopeRow, SignerInfo } from "@/lib/documents/types";

type EnvelopeCardProps = {
  envelope: SignEnvelopeRow;
  onRefresh: (envelope: SignEnvelopeRow) => void;
  onDownload: (envelope: SignEnvelopeRow) => void;
  refreshing?: boolean;
};

/** Parse signers_json com fallback para campos legacy */
function parseSigners(envelope: SignEnvelopeRow): SignerInfo[] {
  if (envelope.signers_json) {
    try {
      const parsed = JSON.parse(envelope.signers_json) as SignerInfo[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through to legacy
    }
  }
  // Fallback: usar campos legacy (envelopes antigos)
  return [
    {
      name: envelope.signer_name || "",
      phone: envelope.signer_phone || "",
      email: envelope.signer_email || "",
      sign_url: envelope.sign_url || "",
      status: envelope.status || "sent",
    },
  ];
}

const SIGNER_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "text-gray-500" },
  sent: { label: "Enviado", className: "text-blue-600 dark:text-blue-400" },
  viewed: { label: "Visualizado", className: "text-yellow-600 dark:text-yellow-400" },
  signed: { label: "Assinado", className: "text-green-600 dark:text-green-400" },
  declined: { label: "Recusado", className: "text-red-600 dark:text-red-400" },
};

function SignerCopyButton({ signUrl }: { signUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signUrl);
    } catch {
      const input = document.createElement("input");
      input.value = signUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar link de assinatura"
      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

export function EnvelopeCard({
  envelope,
  onRefresh,
  onDownload,
  refreshing,
}: EnvelopeCardProps) {
  const signers = parseSigners(envelope);
  const TERMINAL_STATUSES = new Set(["signed", "declined", "completed"]);

  return (
    <div className="border border-border/60 rounded-lg p-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {envelope.subject}
          </p>
        </div>
        <EnvelopeStatusBadge status={envelope.status} />
      </div>

      {/* Lista de signatários */}
      <div className="mt-2 space-y-1">
        {signers.map((signer, idx) => {
          const st = SIGNER_STATUS_LABEL[signer.status] ?? SIGNER_STATUS_LABEL.sent;
          // Mostrar link se o signatário tem URL e ainda não assinou/recusou
          const showLink =
            !!signer.sign_url && !TERMINAL_STATUSES.has(signer.status);

          return (
            <div
              key={idx}
              className="flex items-center gap-2 text-xs"
            >
              <span className="text-foreground font-medium truncate">
                {signer.name}
              </span>
              {signer.phone && (
                <span className="text-muted-foreground shrink-0">
                  {signer.phone}
                </span>
              )}
              <span className={`text-[10px] font-semibold shrink-0 ${st.className}`}>
                {st.label}
              </span>
              {showLink && (
                <span className="inline-flex items-center gap-1 ml-auto shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(signer.sign_url, "_blank", "noopener,noreferrer")
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Assinar
                  </button>
                  <SignerCopyButton signUrl={signer.sign_url} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <span className="text-[10px] text-muted-foreground">
          {envelope.created_at
            ? new Date(envelope.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRefresh(envelope)}
            disabled={refreshing}
            title="Atualizar status"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
          {envelope.status === "completed" && (
            <button
              type="button"
              onClick={() => onDownload(envelope)}
              title="Baixar PDF assinado"
              className="p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

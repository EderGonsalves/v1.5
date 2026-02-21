"use client";

import {
  FileText,
  Send,
  Eye,
  CheckCircle,
  ShieldCheck,
  XCircle,
  Clock,
} from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: typeof FileText }
> = {
  draft: {
    label: "Rascunho",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    icon: FileText,
  },
  sent: {
    label: "Enviado",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    icon: Send,
  },
  viewed: {
    label: "Visualizado",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    icon: Eye,
  },
  signed: {
    label: "Assinado",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    icon: CheckCircle,
  },
  completed: {
    label: "Concluído",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: ShieldCheck,
  },
  declined: {
    label: "Recusado",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: XCircle,
  },
  expired: {
    label: "Expirado",
    className: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300",
    icon: Clock,
  },
};

type Props = { status: string };

export function EnvelopeStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${config.className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

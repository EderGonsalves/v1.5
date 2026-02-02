import { notFound } from "next/navigation";

import { CaseChatView } from "@/components/chat/CaseChatView";
import { isCasePaused } from "@/lib/case-stats";
import type { CaseSummary } from "@/hooks/use-case-chat";
import { getBaserowCaseById } from "@/services/api";

type PageParams = {
  caseId: string;
};

const parseCaseRowId = (value: string | string[]): number | null => {
  if (Array.isArray(value)) {
    return parseCaseRowId(value[0]);
  }
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default async function CaseChatPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const caseRowId = parseCaseRowId(resolvedParams.caseId);
  if (!caseRowId) {
    notFound();
  }

  const caseRow = await getBaserowCaseById(caseRowId);
  if (!caseRow) {
    notFound();
  }

  const initialCase: CaseSummary = {
    id: caseRow.id,
    caseIdentifier: caseRow.CaseId ?? caseRow.id,
    customerName: caseRow.CustumerName ?? "Cliente",
    customerPhone: caseRow.CustumerPhone ?? "",
    paused: isCasePaused(caseRow),
    bjCaseId: caseRow.BJCaseId ?? null,
  };

  return <CaseChatView caseRowId={caseRowId} initialCase={initialCase} />;
}

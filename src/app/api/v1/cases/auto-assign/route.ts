import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { fetchInstitutionUsers } from "@/services/permissions";
import { updateBaserowCase } from "@/services/api";
import type { BaserowCaseRow } from "@/services/api";

const BASEROW_API_URL =
  process.env.NEXT_PUBLIC_BASEROW_API_URL ||
  process.env.BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "";
const BASEROW_API_KEY =
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ||
  process.env.BASEROW_API_KEY ||
  process.env.AUTOMATION_DB_TOKEN ||
  "";
const BASEROW_CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 515;

const TRANSFER_WEBHOOK_URL =
  "https://automation-webhook.riasistemas.com.br/webhook/v2-tranferencia";

// Throttle: max 1 execution per institution every 30 seconds
const lastRunMap = new Map<number, number>();
const THROTTLE_MS = 30_000;

function verifyAuth(request: NextRequest) {
  const authCookie = request.cookies.get("onboarding_auth");
  if (!authCookie?.value) {
    return { valid: false as const, error: "Não autenticado" };
  }
  try {
    const authData = JSON.parse(authCookie.value);
    const institutionId = authData?.institutionId as number | undefined;
    if (!institutionId) {
      return { valid: false as const, error: "Instituição não encontrada" };
    }
    return { valid: true as const, institutionId };
  } catch {
    return { valid: false as const, error: "Token inválido" };
  }
}

async function fetchUnassignedCases(
  institutionId: number,
): Promise<BaserowCaseRow[]> {
  const params = new URLSearchParams({
    user_field_names: "true",
    size: "200",
    "filter__responsavel__equal": "",
    // SEMPRE filtrar por instituição — cada instituição atribui apenas seus casos
    "filter__InstitutionID__equal": String(institutionId),
  });

  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?${params.toString()}`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Token ${BASEROW_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return (response.data?.results || []) as BaserowCaseRow[];
}

async function notifyWebhook(payload: Record<string, unknown>) {
  try {
    await fetch(TRANSFER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Erro ao notificar webhook de auto-assign:", err);
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { institutionId } = auth;

  // Throttle check
  const lastRun = lastRunMap.get(institutionId) ?? 0;
  if (Date.now() - lastRun < THROTTLE_MS) {
    return NextResponse.json({ assigned: [], throttled: true });
  }
  lastRunMap.set(institutionId, Date.now());

  try {
    // Get institution users
    const users = await fetchInstitutionUsers(institutionId);
    const activeUsers = users.filter((u) => u.isActive);

    if (activeUsers.length === 0) {
      return NextResponse.json({ assigned: [], reason: "no_active_users" });
    }

    // Pick user with smallest (oldest) ID
    const targetUser = activeUsers.reduce((oldest, current) =>
      current.id < oldest.id ? current : oldest,
    );

    // Fetch unassigned cases
    const unassigned = await fetchUnassignedCases(institutionId);

    if (unassigned.length === 0) {
      return NextResponse.json({ assigned: [] });
    }

    // Assign each case
    const assigned: Array<{
      caseId: number;
      userName: string;
    }> = [];

    for (const caseRow of unassigned) {
      try {
        await updateBaserowCase(caseRow.id, {
          responsavel: targetUser.name,
        });

        assigned.push({
          caseId: caseRow.id,
          userName: targetUser.name,
        });

        // Notify webhook (fire-and-forget)
        notifyWebhook({
          type: "new_case",
          message: "Você recebeu um novo caso.",
          user: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
            institutionId,
          },
          case: {
            id: caseRow.id,
            caseId: caseRow.CaseId,
            customerName: caseRow.CustumerName,
            customerPhone: caseRow.CustumerPhone,
            bjCaseId: caseRow.BJCaseId,
            institutionId,
            responsavel: targetUser.name,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error(
          `Erro ao atribuir caso ${caseRow.id} para ${targetUser.name}:`,
          err,
        );
      }
    }

    return NextResponse.json({ assigned });
  } catch (err) {
    console.error("Erro no auto-assign:", err);
    return NextResponse.json(
      { error: "Erro ao processar auto-atribuição" },
      { status: 500 },
    );
  }
}

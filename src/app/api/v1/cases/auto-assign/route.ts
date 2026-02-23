import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { getRequestAuth } from "@/lib/auth/session";
import { getQueueMode } from "@/lib/queue-mode";
import { createAssignmentGhostMessage } from "@/lib/chat/assignment-message";
import { fetchInstitutionUsers } from "@/services/permissions";
import { updateBaserowCase } from "@/services/api";
import type { BaserowCaseRow } from "@/services/api";
import { fetchDepartmentUserIds } from "@/services/departments";
import { getPhoneDepartmentMap } from "@/lib/waba";
import { fetchQueueRecords, recordAssignmentsBatch, pickNextUser } from "@/services/assignment-queue";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ||
  process.env.NEXT_PUBLIC_BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "";
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ||
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ||
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
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const institutionId = auth.institutionId;

  // Check queue mode — skip auto-assign entirely for manual mode
  const queueMode = await getQueueMode(institutionId);
  if (queueMode === "manual") {
    return NextResponse.json({ assigned: [], skipped: true, reason: "manual_queue_mode" });
  }

  // Throttle check
  const lastRun = lastRunMap.get(institutionId) ?? 0;
  if (Date.now() - lastRun < THROTTLE_MS) {
    return NextResponse.json({ assigned: [], throttled: true });
  }
  lastRunMap.set(institutionId, Date.now());

  try {
    // Fetch users + phone→department map + queue records in parallel
    const [users, phoneDeptMap, queueRecords] = await Promise.all([
      fetchInstitutionUsers(institutionId),
      getPhoneDepartmentMap(institutionId),
      fetchQueueRecords(institutionId),
    ]);

    // Only active users who receive cases are eligible
    const eligibleUsers = users.filter(
      (u) => u.isActive && u.receivesCases,
    );

    if (eligibleUsers.length === 0) {
      return NextResponse.json({ assigned: [], reason: "no_eligible_users" });
    }

    // Fetch unassigned cases
    const unassigned = await fetchUnassignedCases(institutionId);

    if (unassigned.length === 0) {
      return NextResponse.json({ assigned: [] });
    }

    // Cache dept user lookups to avoid repeated API calls for same dept
    const deptUsersCache = new Map<number, number[]>();

    // Assign each case using round-robin
    const assigned: Array<{
      caseId: number;
      userName: string;
      departmentName?: string | null;
    }> = [];

    // Accumulate assignments for batch update at the end
    const pendingAssignments: Array<{ userId: number; institutionId: number }> = [];

    for (const caseRow of unassigned) {
      try {
        let assignDeptId: number | null = null;
        let assignDeptName: string | null = null;
        let targetUser;

        // Preservar departamento já definido manualmente (não sobrescrever)
        const existingDeptId = Number(caseRow.department_id);
        const hasExistingDept = existingDeptId > 0;

        if (hasExistingDept) {
          // Caso já tem departamento — manter e buscar usuários do departamento
          assignDeptId = existingDeptId;
          assignDeptName = (caseRow.department_name as string) || null;

          try {
            let deptUserIds = deptUsersCache.get(existingDeptId);
            if (!deptUserIds) {
              deptUserIds = await fetchDepartmentUserIds(existingDeptId);
              deptUsersCache.set(existingDeptId, deptUserIds);
            }
            const deptEligibleUsers = eligibleUsers.filter((u) =>
              deptUserIds!.includes(u.id),
            );
            if (deptEligibleUsers.length > 0) {
              targetUser = pickNextUser(deptEligibleUsers, queueRecords);
            } else {
              // Nenhum elegível no departamento — round-robin global
              targetUser = pickNextUser(eligibleUsers, queueRecords);
            }
          } catch {
            targetUser = pickNextUser(eligibleUsers, queueRecords);
          }
        } else {
          // Caso sem departamento — tentar mapear pelo telefone
          const casePhone = caseRow.display_phone_number || caseRow.CustumerPhone || "";
          if (casePhone && phoneDeptMap.size > 0) {
            const phoneDigits = casePhone.replace(/\D/g, "");
            const deptMatch = phoneDeptMap.get(casePhone) || phoneDeptMap.get(phoneDigits);

            if (deptMatch) {
              assignDeptId = deptMatch.deptId;
              assignDeptName = deptMatch.deptName;

              try {
                let deptUserIds = deptUsersCache.get(deptMatch.deptId);
                if (!deptUserIds) {
                  deptUserIds = await fetchDepartmentUserIds(deptMatch.deptId);
                  deptUsersCache.set(deptMatch.deptId, deptUserIds);
                }
                const deptEligibleUsers = eligibleUsers.filter((u) =>
                  deptUserIds!.includes(u.id),
                );
                if (deptEligibleUsers.length > 0) {
                  targetUser = pickNextUser(deptEligibleUsers, queueRecords);
                } else {
                  targetUser = pickNextUser(eligibleUsers, queueRecords);
                }
              } catch {
                targetUser = pickNextUser(eligibleUsers, queueRecords);
              }
            } else {
              targetUser = pickNextUser(eligibleUsers, queueRecords);
            }
          } else {
            targetUser = pickNextUser(eligibleUsers, queueRecords);
          }
        }

        await updateBaserowCase(caseRow.id, {
          responsavel: targetUser.name,
          assigned_to_user_id: targetUser.id,
          department_id: assignDeptId,
          department_name: assignDeptName,
        });

        // Accumulate for batch update (instead of N parallel fire-and-forget calls)
        pendingAssignments.push({ userId: targetUser.id, institutionId });

        // Create ghost message for assignment (fire-and-forget)
        createAssignmentGhostMessage(
          caseRow.id,
          `📋 Caso atribuído automaticamente para ${targetUser.name}`,
        ).catch((err) => console.error("Erro ao criar ghost message:", err));

        assigned.push({
          caseId: caseRow.id,
          userName: targetUser.name,
          departmentName: assignDeptName,
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
          ...(assignDeptId && assignDeptName
            ? { department: { id: assignDeptId, name: assignDeptName } }
            : {}),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error(
          `Erro ao atribuir caso ${caseRow.id}:`,
          err,
        );
      }
    }

    // Batch-record all assignments sequentially (1 PATCH per user, not N parallel)
    recordAssignmentsBatch(pendingAssignments, queueRecords).catch((err) =>
      console.error("Erro ao registrar assignments em batch:", err),
    );

    return NextResponse.json({ assigned });
  } catch (err) {
    console.error("Erro no auto-assign:", err);
    return NextResponse.json(
      { error: "Erro ao processar auto-atribuição" },
      { status: 500 },
    );
  }
}

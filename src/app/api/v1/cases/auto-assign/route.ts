import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { getRequestAuth } from "@/lib/auth/session";
import { getQueueMode } from "@/lib/queue-mode";
import { createAssignmentGhostMessage } from "@/lib/chat/assignment-message";
import { fetchInstitutionUsers, type UserPublicRow } from "@/services/permissions";
import { updateBaserowCase } from "@/services/api";
import type { BaserowCaseRow } from "@/services/api";
import { fetchDepartmentUserIds } from "@/services/departments";
import { getPhoneDepartmentMap } from "@/lib/waba";
import { fetchQueueRecords, recordAssignmentsBatch, pickNextUser, pickNextUserWithAvailability } from "@/services/assignment-queue";
import { checkBatchAvailability, type UserAvailabilityMap } from "@/services/user-availability";

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

  // Check queue mode
  const queueMode = await getQueueMode(institutionId);

  // --- Manual mode: tag departments by phone, then return (no user assignment) ---
  // Cases arrive from N8N without department_id. In manual mode the auto-assign
  // loop never runs, so we must tag cases with the correct department here,
  // based on which WABA phone number received the message.
  if (queueMode === "manual") {
    try {
      const [phoneDeptMap, unassignedForTagging] = await Promise.all([
        getPhoneDepartmentMap(institutionId),
        fetchUnassignedCases(institutionId),
      ]);

      if (phoneDeptMap.size > 0 && unassignedForTagging.length > 0) {
        const tagPromises: Promise<unknown>[] = [];

        for (const caseRow of unassignedForTagging) {
          // Skip cases that already have a department
          const existingDeptId = Number(caseRow.department_id);
          if (existingDeptId > 0) continue;

          // Only use display_phone_number (WABA office phone), NOT CustumerPhone (client phone)
          const wabaPhone = caseRow.display_phone_number ? String(caseRow.display_phone_number).trim() : "";
          if (!wabaPhone) continue;

          const phoneDigits = wabaPhone.replace(/\D/g, "");
          const deptMatch = phoneDeptMap.get(wabaPhone) || phoneDeptMap.get(phoneDigits);

          if (deptMatch) {
            tagPromises.push(
              updateBaserowCase(caseRow.id, {
                department_id: deptMatch.deptId,
                department_name: deptMatch.deptName,
              }),
            );
          }
        }

        if (tagPromises.length > 0) {
          await Promise.allSettled(tagPromises);
          console.log(`[auto-assign] Tagged ${tagPromises.length} cases with department (inst ${institutionId})`);
        }
      }
    } catch (err) {
      console.error("[auto-assign] Erro ao taguear departamentos:", err);
    }

    return NextResponse.json({ assigned: [], skipped: true, reason: "manual_queue_mode" });
  }

  const useAgendaCheck = queueMode === "round_robin_agenda";

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

    // Pre-compute availability map (1 batch call) for round_robin_agenda mode
    let availability: UserAvailabilityMap | null = null;
    if (useAgendaCheck) {
      try {
        availability = await checkBatchAvailability(eligibleUsers, institutionId);
      } catch (err) {
        console.error("[auto-assign] Erro ao verificar disponibilidade, fallback round-robin puro:", err);
        availability = null;
      }
    }

    // Helper: pick user with or without availability check
    const pickUser = (candidates: UserPublicRow[]): UserPublicRow | null => {
      if (availability) {
        return pickNextUserWithAvailability(candidates, queueRecords, availability);
      }
      return pickNextUser(candidates, queueRecords);
    };

    // Cache dept user lookups to avoid repeated API calls for same dept
    const deptUsersCache = new Map<number, number[]>();

    // Assign each case using round-robin
    const assigned: Array<{
      caseId: number;
      userName: string;
      departmentName?: string | null;
    }> = [];
    let skippedByAvailability = 0;

    // Accumulate assignments for batch update at the end
    const pendingAssignments: Array<{ userId: number; institutionId: number }> = [];

    for (const caseRow of unassigned) {
      try {
        let assignDeptId: number | null = null;
        let assignDeptName: string | null = null;
        let targetUser: UserPublicRow | null = null;

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
              targetUser = pickUser(deptEligibleUsers);
            } else {
              // Nenhum elegível no departamento — round-robin global
              targetUser = pickUser(eligibleUsers);
            }
          } catch {
            targetUser = pickUser(eligibleUsers);
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
                  targetUser = pickUser(deptEligibleUsers);
                } else {
                  targetUser = pickUser(eligibleUsers);
                }
              } catch {
                targetUser = pickUser(eligibleUsers);
              }
            } else {
              targetUser = pickUser(eligibleUsers);
            }
          } else {
            targetUser = pickUser(eligibleUsers);
          }
        }

        // If no user available (all busy, no future slots) → skip case
        if (!targetUser) {
          skippedByAvailability++;
          continue;
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

    return NextResponse.json({
      assigned,
      ...(skippedByAvailability > 0 ? { skippedByAvailability } : {}),
    });
  } catch (err) {
    console.error("Erro no auto-assign:", err);
    return NextResponse.json(
      { error: "Erro ao processar auto-atribuição" },
      { status: 500 },
    );
  }
}

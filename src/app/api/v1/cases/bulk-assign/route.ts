import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { getQueueMode } from "@/lib/queue-mode";
import { createAssignmentGhostMessage } from "@/lib/chat/assignment-message";
import { updateBaserowCase, getBaserowCaseById } from "@/services/api";
import { fetchPermissionsStatus, fetchInstitutionUsers } from "@/services/permissions";
import { notifyTransferWebhook } from "@/services/transfer-notify";

const MAX_BULK_SIZE = 50;

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Only admins can bulk assign
  const legacyId = resolveLegacyIdentifier(auth);
  if (!legacyId) {
    return NextResponse.json({ error: "Usuário não identificado" }, { status: 403 });
  }

  const perms = await fetchPermissionsStatus(auth.institutionId, legacyId);
  if (!perms.isSysAdmin && !perms.isOfficeAdmin) {
    return NextResponse.json(
      { error: "Apenas administradores podem atribuir casos em lote" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { caseIds, targetUserId } = body as {
    caseIds?: number[];
    targetUserId?: number;
  };

  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    return NextResponse.json(
      { error: "caseIds deve ser um array com pelo menos 1 item" },
      { status: 400 },
    );
  }

  if (caseIds.length > MAX_BULK_SIZE) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_BULK_SIZE} casos por operação` },
      { status: 400 },
    );
  }

  if (!targetUserId || typeof targetUserId !== "number") {
    return NextResponse.json(
      { error: "targetUserId é obrigatório e deve ser um número" },
      { status: 400 },
    );
  }

  const institutionId = auth.institutionId;

  try {
    // Find target user and admin user info
    const users = await fetchInstitutionUsers(institutionId);
    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return NextResponse.json(
        { error: "Usuário-alvo não encontrado nesta instituição" },
        { status: 404 },
      );
    }

    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: "Usuário-alvo está inativo" },
        { status: 400 },
      );
    }

    // Resolve admin name for ghost messages
    const adminUser = users.find((u) => u.id === perms.userId);
    const adminName = adminUser?.name ?? "Administrador";

    // Process each case in parallel
    const results = await Promise.allSettled(
      caseIds.map(async (caseId) => {
        const caseRow = await getBaserowCaseById(caseId);
        if (!caseRow) {
          return { caseId, status: "failed" as const, reason: "not_found" };
        }

        // Verify institution
        const caseInstId = Number(caseRow.InstitutionID);
        if (caseInstId !== institutionId && institutionId !== 4) {
          return { caseId, status: "failed" as const, reason: "wrong_institution" };
        }

        // Check if already assigned
        if (caseRow.responsavel && String(caseRow.responsavel).trim() !== "") {
          return { caseId, status: "skipped" as const, reason: "already_assigned" };
        }

        // Assign case
        await updateBaserowCase(caseId, {
          responsavel: targetUser.name,
          assigned_to_user_id: targetUser.id,
        });

        // Create ghost message (fire-and-forget)
        createAssignmentGhostMessage(
          caseId,
          `📋 ${adminName} atribuiu o caso para ${targetUser.name}`,
        ).catch((err) => console.error("Erro ghost message bulk:", err));

        // Notify webhook (fire-and-forget)
        notifyTransferWebhook({
          type: "new_case",
          user: targetUser,
          caseInfo: {
            id: caseRow.id,
            caseId: caseRow.CaseId,
            customerName: caseRow.CustumerName,
            customerPhone: caseRow.CustumerPhone,
            bjCaseId: caseRow.BJCaseId,
            institutionId,
            responsavel: targetUser.name,
          },
        }).catch((err) => console.error("Erro webhook bulk:", err));

        return { caseId, status: "assigned" as const, userName: targetUser.name };
      }),
    );

    // Aggregate results
    const assigned: Array<{ caseId: number; userName: string }> = [];
    const skipped: Array<{ caseId: number; reason: string }> = [];
    const failed: Array<{ caseId: number; reason: string }> = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        const val = result.value;
        if (val.status === "assigned") {
          assigned.push({ caseId: val.caseId, userName: val.userName });
        } else if (val.status === "skipped") {
          skipped.push({ caseId: val.caseId, reason: val.reason });
        } else {
          failed.push({ caseId: val.caseId, reason: val.reason });
        }
      } else {
        // Promise rejected
        const caseId = caseIds[results.indexOf(result)];
        failed.push({ caseId, reason: "error" });
      }
    }

    return NextResponse.json({
      assigned,
      skipped,
      failed,
      total: caseIds.length,
      successCount: assigned.length,
    });
  } catch (err) {
    console.error("Erro no bulk-assign:", err);
    return NextResponse.json(
      { error: "Erro ao processar atribuição em lote" },
      { status: 500 },
    );
  }
}

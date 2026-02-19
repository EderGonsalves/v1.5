import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { getQueueMode } from "@/lib/queue-mode";
import { createAssignmentGhostMessage } from "@/lib/chat/assignment-message";
import { updateBaserowCase, getBaserowCaseById } from "@/services/api";
import { fetchPermissionsStatus, fetchInstitutionUsers } from "@/services/permissions";
import { fetchDepartmentUserIds } from "@/services/departments";
import { notifyTransferWebhook } from "@/services/transfer-notify";

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { caseId } = body as { caseId?: number };
  if (!caseId || typeof caseId !== "number") {
    return NextResponse.json(
      { error: "caseId é obrigatório e deve ser um número" },
      { status: 400 },
    );
  }

  const institutionId = auth.institutionId;

  // Verify queue mode is manual
  const queueMode = await getQueueMode(institutionId);
  if (queueMode !== "manual") {
    return NextResponse.json(
      { error: "Operação disponível apenas no modo de fila manual" },
      { status: 403 },
    );
  }

  // Resolve current user identity
  const legacyId = resolveLegacyIdentifier(auth);
  if (!legacyId) {
    return NextResponse.json({ error: "Usuário não identificado" }, { status: 403 });
  }

  try {
    const [perms, caseRow] = await Promise.all([
      fetchPermissionsStatus(institutionId, legacyId),
      getBaserowCaseById(caseId),
    ]);

    if (!caseRow) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }

    // Verify case belongs to the same institution
    const caseInstitutionId = Number(caseRow.InstitutionID);
    if (caseInstitutionId !== institutionId && institutionId !== 4) {
      return NextResponse.json({ error: "Caso não pertence à sua instituição" }, { status: 403 });
    }

    // Race condition guard: check if case is still unassigned
    if (caseRow.responsavel && String(caseRow.responsavel).trim() !== "") {
      return NextResponse.json(
        { error: "Este caso já foi atribuído a outro atendente" },
        { status: 409 },
      );
    }

    // Department visibility check
    const caseDeptId = Number(caseRow.department_id);
    if (caseDeptId > 0 && !perms.isSysAdmin && !perms.isOfficeAdmin) {
      const deptUserIds = await fetchDepartmentUserIds(caseDeptId);
      if (!deptUserIds.includes(perms.userId)) {
        return NextResponse.json(
          { error: "Você não tem acesso a casos deste departamento" },
          { status: 403 },
        );
      }
    }

    // Find the claiming user's full info
    const users = await fetchInstitutionUsers(institutionId);
    const claimingUser = users.find((u) => u.id === perms.userId);
    if (!claimingUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Assign case to claiming user
    const updatedCase = await updateBaserowCase(caseId, {
      responsavel: claimingUser.name,
      assigned_to_user_id: claimingUser.id,
    });

    // Create ghost message (fire-and-forget)
    createAssignmentGhostMessage(
      caseId,
      `📋 ${claimingUser.name} pegou o caso da fila de espera`,
    ).catch((err) => console.error("Erro ao criar ghost message:", err));

    // Notify transfer webhook (fire-and-forget)
    notifyTransferWebhook({
      type: "new_case",
      user: claimingUser,
      caseInfo: {
        id: caseRow.id,
        caseId: caseRow.CaseId,
        customerName: caseRow.CustumerName,
        customerPhone: caseRow.CustumerPhone,
        bjCaseId: caseRow.BJCaseId,
        institutionId,
        responsavel: claimingUser.name,
      },
    }).catch((err) => console.error("Erro ao notificar webhook:", err));

    return NextResponse.json({ success: true, case: updatedCase });
  } catch (err) {
    console.error("Erro ao pegar caso:", err);
    return NextResponse.json(
      { error: "Erro ao processar a solicitação" },
      { status: 500 },
    );
  }
}

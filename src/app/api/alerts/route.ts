import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getBaserowCaseById } from "@/services/api";
import { sendCaseAlert } from "@/lib/alerts";
import type { CaseStage } from "@/lib/case-stats";

const SYSADMIN_INSTITUTION_ID = 4;

const VALID_STAGES: CaseStage[] = [
  "DepoimentoInicial",
  "EtapaPerguntas",
  "EtapaFinal",
];

const isValidStage = (value: unknown): value is CaseStage => {
  return typeof value === "string" && VALID_STAGES.includes(value as CaseStage);
};

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const { caseId, alertType, institutionId } = body;

    // Verify institution access
    const parsedInst = Number(institutionId);
    if (
      auth.institutionId !== SYSADMIN_INSTITUTION_ID &&
      Number.isFinite(parsedInst) &&
      auth.institutionId !== parsedInst
    ) {
      return NextResponse.json(
        { error: "Sem permissão para esta instituição" },
        { status: 403 },
      );
    }

    // Validate required fields
    if (!caseId) {
      return NextResponse.json(
        { error: "caseId é obrigatório" },
        { status: 400 },
      );
    }

    if (!alertType) {
      return NextResponse.json(
        { error: "alertType é obrigatório" },
        { status: 400 },
      );
    }

    if (!isValidStage(alertType)) {
      return NextResponse.json(
        {
          error: `alertType inválido. Valores aceitos: ${VALID_STAGES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!institutionId) {
      return NextResponse.json(
        { error: "institutionId é obrigatório" },
        { status: 400 },
      );
    }

    const parsedCaseId = Number(caseId);
    const parsedInstitutionId = Number(institutionId);

    if (!Number.isFinite(parsedCaseId)) {
      return NextResponse.json(
        { error: "caseId deve ser um número válido" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(parsedInstitutionId)) {
      return NextResponse.json(
        { error: "institutionId deve ser um número válido" },
        { status: 400 },
      );
    }

    // Fetch the case data
    const caseData = await getBaserowCaseById(parsedCaseId);

    if (!caseData) {
      return NextResponse.json(
        { error: `Caso ${parsedCaseId} não encontrado` },
        { status: 404 },
      );
    }

    // Send the alert
    const result = await sendCaseAlert(
      alertType,
      caseData,
      parsedInstitutionId,
    );

    return NextResponse.json({
      success: true,
      message: `Alerta ${alertType} processado`,
      ...result,
    });
  } catch (error) {
    console.error("Erro ao processar alerta:", error);

    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    message: "API de Alertas",
    endpoints: {
      POST: {
        description: "Dispara um alerta para os webhooks configurados",
        body: {
          caseId: "number - ID do caso no Baserow",
          alertType: `string - Tipo do alerta: ${VALID_STAGES.join(" | ")}`,
          institutionId: "number - ID da instituição",
        },
      },
    },
  });
}

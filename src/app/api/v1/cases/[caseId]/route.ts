import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { getBaserowCaseById, type BaserowCaseRow } from "@/services/api";

/**
 * GET /api/v1/cases/[caseId] — Full case detail (all fields including heavy ones)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { caseId: caseIdParam } = await params;
    const caseId = Number(caseIdParam);
    if (!Number.isFinite(caseId) || caseId < 1) {
      return NextResponse.json(
        { error: "caseId inválido" },
        { status: 400 },
      );
    }

    const caseRow: BaserowCaseRow | null = await getBaserowCaseById(caseId);
    if (!caseRow) {
      return NextResponse.json(
        { error: "Caso não encontrado" },
        { status: 404 },
      );
    }

    // Permission check: SysAdmin sees all, others only their institution
    const isSysAdmin = auth.institutionId === 4;
    if (!isSysAdmin) {
      const caseInstId =
        caseRow.InstitutionID ??
        (typeof caseRow["body.auth.institutionId"] === "number"
          ? caseRow["body.auth.institutionId"]
          : Number(caseRow["body.auth.institutionId"]));
      if (caseInstId && Number(caseInstId) !== auth.institutionId) {
        return NextResponse.json(
          { error: "Acesso negado" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ case: caseRow });
  } catch (error) {
    console.error("[GET /api/v1/cases/[caseId]] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao buscar caso",
      },
      { status: 500 },
    );
  }
}

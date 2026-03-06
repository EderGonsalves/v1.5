import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { getBaserowCases } from "@/services/api";

export type PendingCaseRow = {
  id: number;
  caseId: number | null;
  customerName: string;
  customerPhone: string;
  responsavel: string;
  createdAt: string | null;
  institutionId: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const responsavel = searchParams.get("responsavel");
    const institutionId = searchParams.get("institutionId");

    if (!responsavel || !institutionId) {
      return NextResponse.json(
        { error: "responsavel e institutionId sao obrigatorios" },
        { status: 400 },
      );
    }

    const isSysAdmin = auth.institutionId === 4;
    if (!isSysAdmin && String(auth.institutionId) !== institutionId) {
      return NextResponse.json({ error: "Acesso nao autorizado" }, { status: 403 });
    }

    // Try direct SQL
    if (useDirectDb("api")) {
      const result = await tryDrizzle("api", async () => {
        const isNoResp = responsavel === "Sem responsavel";

        const instFilter = isSysAdmin
          ? sql``
          : sql`AND field_1692 = ${institutionId}`;

        const respFilter = isNoResp
          ? sql`AND (COALESCE(NULLIF(trim(field_1771), ''), 'Sem responsavel') = 'Sem responsavel')`
          : sql`AND trim(field_1771) = ${responsavel}`;

        const rows = await db.execute(sql`
          SELECT
            id,
            CAST(field_1683 AS integer) AS case_id,
            COALESCE(field_1685, '') AS customer_name,
            COALESCE(field_1684, '') AS customer_phone,
            COALESCE(NULLIF(trim(field_1771), ''), 'Sem responsavel') AS responsavel,
            field_1699 AS created_at,
            COALESCE(field_1692, '') AS institution_id
          FROM database_table_225
          WHERE (
            lower(trim(COALESCE(field_1753, ''))) NOT IN ('ganho', 'perdido')
            OR field_1753 IS NULL
            OR trim(field_1753) = ''
          )
          ${instFilter}
          ${respFilter}
          ORDER BY field_1699 ASC
        `);

        return (rows.rows as Array<{
          id: number;
          case_id: number | null;
          customer_name: string;
          customer_phone: string;
          responsavel: string;
          created_at: string | null;
          institution_id: string;
        }>).map((r) => ({
          id: r.id,
          caseId: r.case_id,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          responsavel: r.responsavel,
          createdAt: r.created_at,
          institutionId: r.institution_id,
        }));
      });

      if (result !== undefined) {
        return NextResponse.json({ cases: result });
      }
    }

    // Fallback: load all cases via Baserow and filter in JS
    const numInst = Number(institutionId);
    const response = await getBaserowCases({
      institutionId: numInst,
      pageSize: 200,
      fetchAll: true,
    });

    const isNoResp = responsavel === "Sem responsavel";
    const pending = response.results
      .filter((c) => {
        const res = typeof c.resultado === "string" ? c.resultado.trim().toLowerCase() : "";
        if (res === "ganho" || res === "perdido") return false;

        const caseResp = typeof c.responsavel === "string" && c.responsavel.trim()
          ? c.responsavel.trim()
          : "Sem responsavel";
        return isNoResp ? caseResp === "Sem responsavel" : caseResp === responsavel;
      })
      .map((c) => ({
        id: c.id,
        caseId: c.CaseId ?? null,
        customerName: c.CustumerName ?? "",
        customerPhone: c.CustumerPhone ?? "",
        responsavel: typeof c.responsavel === "string" && c.responsavel.trim()
          ? c.responsavel.trim()
          : "Sem responsavel",
        createdAt: c.Data ?? c.data ?? null,
        institutionId: String(c.InstitutionID ?? institutionId),
      }))
      .sort((a, b) => {
        if (!a.createdAt) return -1;
        if (!b.createdAt) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return NextResponse.json({ cases: pending });
  } catch (error) {
    console.error("Erro ao buscar casos pendentes:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar casos pendentes" },
      { status: 500 },
    );
  }
}

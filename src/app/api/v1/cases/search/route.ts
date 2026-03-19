import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { findUserInInstitution } from "@/services/permissions";
import { db } from "@/lib/db";
import { cases as casesTable } from "@/lib/db/schema/cases";
import { ilike, eq, and, or, sql } from "drizzle-orm";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { baserowGet, type BaserowCaseRow } from "@/services/api";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL || process.env.NEXT_PUBLIC_BASEROW_API_URL || "";
const BASEROW_CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 225;

export type CaseSearchResult = {
  id: number;
  CaseId?: number;
  CustumerName?: string;
  CustumerPhone?: string;
  resultado?: string | null;
};

// ---------------------------------------------------------------------------
// GET /api/v1/cases/search?q=...&user_id=...&department_id=...
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const isSysAdmin = auth.institutionId === 4;

    // Resolve current user for permission filtering
    let currentUserId: number | null = null;
    let isOfficeAdmin = false;
    if (!isSysAdmin) {
      const legacyId = resolveLegacyIdentifier(auth);
      if (legacyId) {
        const userInfo = await findUserInInstitution(
          auth.institutionId,
          legacyId,
          auth.payload?.email as string | undefined,
        );
        if (userInfo) {
          currentUserId = userInfo.id;
          isOfficeAdmin = Boolean(userInfo.is_office_admin);
        }
      }
    }

    const userIdFilter = request.nextUrl.searchParams.get("user_id");
    const departmentIdFilter = request.nextUrl.searchParams.get("department_id");

    // ---------- Drizzle path ----------
    const directDb = useDirectDb("api"); // eslint-disable-line react-hooks/rules-of-hooks -- not a React hook
    if (directDb) {
      const drResult = await tryDrizzle("api", async () => {
        const searchPattern = `%${q}%`;
        const conditions = [
          or(
            ilike(casesTable.custumerName, searchPattern),
            ilike(casesTable.custumerPhone, searchPattern),
            sql`CAST(${casesTable.caseId} AS TEXT) LIKE ${searchPattern}`,
          ),
        ];

        // Institution filter (non-sysadmin)
        if (!isSysAdmin) {
          conditions.push(
            eq(casesTable.institutionID, String(auth.institutionId)),
          );
        }

        // Permission-based filtering for regular users
        if (!isSysAdmin && !isOfficeAdmin && currentUserId) {
          conditions.push(
            or(
              eq(casesTable.assignedToUserId, String(currentUserId)),
              ...(departmentIdFilter
                ? [eq(casesTable.departmentId, departmentIdFilter)]
                : []),
            )!,
          );
        }

        // Explicit filters from query params
        if (userIdFilter) {
          conditions.push(eq(casesTable.assignedToUserId, userIdFilter));
        }
        if (departmentIdFilter && (isSysAdmin || isOfficeAdmin)) {
          conditions.push(eq(casesTable.departmentId, departmentIdFilter));
        }

        const rows = await db
          .select({
            id: casesTable.id,
            caseId: casesTable.caseId,
            custumerName: casesTable.custumerName,
            custumerPhone: casesTable.custumerPhone,
            resultado: casesTable.resultado,
          })
          .from(casesTable)
          .where(and(...conditions))
          .limit(20);

        return rows.map((row) => ({
          id: row.id,
          CaseId: row.caseId ?? undefined,
          CustumerName: row.custumerName ?? undefined,
          CustumerPhone: row.custumerPhone ?? undefined,
          resultado: row.resultado ?? null,
        }));
      });
      if (drResult !== undefined) {
        return NextResponse.json({ results: drResult });
      }
    }

    // ---------- Baserow fallback ----------
    const searchUrl = new URL(
      `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/`,
    );
    searchUrl.searchParams.set("user_field_names", "true");
    searchUrl.searchParams.set("size", "20");
    searchUrl.searchParams.set(
      "filter__CustumerName__contains",
      q,
    );
    if (!isSysAdmin) {
      searchUrl.searchParams.set(
        "filter__InstitutionID__equal",
        String(auth.institutionId),
      );
    }

    const resp = await baserowGet(searchUrl.toString(), 15000);
    const data = resp.data as { results?: BaserowCaseRow[] } | undefined;
    const rows = (data?.results ?? []) as BaserowCaseRow[];
    const results: CaseSearchResult[] = rows.map((r) => ({
      id: r.id,
      CaseId: r.CaseId,
      CustumerName: r.CustumerName,
      CustumerPhone: r.CustumerPhone,
      resultado: r.resultado ?? null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Erro na busca de casos:", err);
    return NextResponse.json(
      { error: "Erro ao buscar casos" },
      { status: 500 },
    );
  }
}

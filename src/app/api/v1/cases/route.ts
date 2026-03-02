import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { findUserInInstitution } from "@/services/permissions";
import {
  createBaserowCase,
  baserowGet,
  getBaserowCases,
  mapCaseRowLight,
  stripHeavyFields,
  type BaserowCaseRow,
} from "@/services/api";
import { db } from "@/lib/db";
import { cases as casesTable } from "@/lib/db/schema/cases";
import { like, eq, and } from "drizzle-orm";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";
import { prepared } from "@/lib/db/prepared";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL || process.env.NEXT_PUBLIC_BASEROW_API_URL || "";
const BASEROW_CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 225;

// ---------------------------------------------------------------------------
// GET /api/v1/cases — List all cases (light, no heavy fields)
// ---------------------------------------------------------------------------

type CasesCache = {
  institutionId: number;
  cases: BaserowCaseRow[];
  totalCount: number;
  timestamp: number;
};

const CASES_CACHE_TTL_MS = 30_000; // 30s
let casesCache: CasesCache | null = null;

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const isSysAdmin = auth.institutionId === 4;

    // Check cache
    if (
      !refresh &&
      casesCache &&
      casesCache.institutionId === auth.institutionId &&
      Date.now() - casesCache.timestamp < CASES_CACHE_TTL_MS
    ) {
      return NextResponse.json({
        cases: casesCache.cases,
        totalCount: casesCache.totalCount,
        cached: true,
        cachedAt: casesCache.timestamp,
      });
    }

    let lightCases: BaserowCaseRow[] = [];

    // Path 1: Drizzle (direct DB)
    if (useDirectDb("api")) {
      const drResult = await tryDrizzle("api", async () => {
        const rows = isSysAdmin
          ? await prepared.getAllCasesLight.execute({})
          : await prepared.getCasesLightByInstitution.execute({
              institutionId: String(auth.institutionId),
            });
        return rows.map(mapCaseRowLight);
      });
      if (drResult !== undefined) {
        lightCases = drResult;
      }
    }

    // Path 2: Baserow fallback (server-side, no maxPages limit)
    if (lightCases.length === 0) {
      const resp = await getBaserowCases({
        institutionId: isSysAdmin ? undefined : auth.institutionId,
        fetchAll: true,
        newestFirst: true,
      });
      lightCases = resp.results.map(stripHeavyFields);
    }

    // Cache result
    casesCache = {
      institutionId: auth.institutionId,
      cases: lightCases,
      totalCount: lightCases.length,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      cases: lightCases,
      totalCount: lightCases.length,
      cached: false,
      cachedAt: casesCache.timestamp,
    });
  } catch (error) {
    console.error("[GET /api/v1/cases] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao listar casos",
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/cases — Create a new case
// ---------------------------------------------------------------------------

const createCaseSchema = z.object({
  customerName: z.string().min(1, "Nome é obrigatório").max(200),
  customerPhone: z.string().min(1, "Telefone é obrigatório").max(50),
});

export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // All authenticated users can create cases
    const legacyUserId = resolveLegacyIdentifier(auth);
    const email = typeof auth.payload?.email === "string"
      ? auth.payload.email
      : undefined;

    // Resolve current user for metadata (cached, non-blocking)
    const currentUser = legacyUserId
      ? await findUserInInstitution(auth.institutionId, legacyUserId, email)
      : null;

    const body = await request.json();
    const parsed = createCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const phone = parsed.data.customerPhone.trim();
    const phoneDigits = phone.replace(/\D/g, "");

    // Duplicate check via server-side filter (fast, single filtered query)
    if (phoneDigits.length >= 8) {
      try {
        if (useDirectDb("api")) {
          const _dr = await tryDrizzle("cases", async () => {
            const conditions = [like(casesTable.custumerPhone, `%${phoneDigits.slice(-8)}%`)];
            if (auth.institutionId !== 4) {
              conditions.push(eq(casesTable.institutionID, String(auth.institutionId)));
            }
            const [dup] = await db
              .select({ id: casesTable.id, CustumerName: casesTable.custumerName })
              .from(casesTable)
              .where(and(...conditions))
              .limit(1);
            if (dup) {
              return NextResponse.json(
                {
                  error: "Já existe um caso com este telefone",
                  existingCase: { id: dup.id, customerName: dup.CustumerName },
                },
                { status: 409 },
              );
            }
          });
          if (_dr !== undefined) return _dr;
        } else {
          const params = new URLSearchParams({
            user_field_names: "true",
            size: "1",
            filter__CustumerPhone__contains: phoneDigits.slice(-8),
          });
          if (auth.institutionId !== 4) {
            params.set("filter__InstitutionID__equal", String(auth.institutionId));
          }
          const dupUrl = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?${params.toString()}`;
          const dupResp = await baserowGet<{ results?: Array<{ id: number; CustumerName?: string }> }>(dupUrl, 10000);
          const duplicate = dupResp.data?.results?.[0];
          if (duplicate) {
            return NextResponse.json(
              {
                error: "Já existe um caso com este telefone",
                existingCase: { id: duplicate.id, customerName: duplicate.CustumerName },
              },
              { status: 409 },
            );
          }
        }
      } catch {
        // If duplicate check fails, proceed with creation anyway
      }
    }

    const userName = currentUser?.name
      || (typeof auth.payload?.name === "string" ? auth.payload.name : "")
      || legacyUserId
      || "Usuário";

    const newCase = await createBaserowCase({
      CustumerName: parsed.data.customerName.trim(),
      CustumerPhone: phone,
      InstitutionID: auth.institutionId,
      Data: new Date().toISOString(),
      responsavel: userName,
      assigned_to_user_id: currentUser?.id || null,
      case_source: "manual",
      created_by_user_id: currentUser?.id || null,
      created_by_user_name: userName,
    });

    return NextResponse.json({ case: newCase }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/v1/cases] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao criar caso",
      },
      { status: 500 },
    );
  }
}

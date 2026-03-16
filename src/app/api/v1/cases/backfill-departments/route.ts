import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getRequestAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * POST /api/v1/cases/backfill-departments
 *
 * Backfill: atualiza department_id nos casos que têm assigned_to_user_id
 * mas não têm department_id, baseado na tabela user_departments (248).
 *
 * Lógica: caso.assigned_to_user_id → user_departments.user_id → department_id
 * Se o usuário pertence a exatamente 1 departamento, atribui ao caso.
 * Se pertence a múltiplos, usa o primary (menor ID) ou o primeiro.
 *
 * Também busca department_name da tabela departments (247).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const isSysAdmin = auth.institutionId === 4;
    const instFilter = isSysAdmin
      ? sql`1=1`
      : sql`c.field_1692 = ${String(auth.institutionId)}`;

    // Single UPDATE query: join cases → user_departments → departments
    // Only updates cases where department_id is null/empty AND assigned_to_user_id exists
    const result = await db.execute(sql`
      WITH user_dept AS (
        SELECT DISTINCT ON (ud.field_1898)
          ud.field_1898 AS user_id,
          ud.field_1899 AS dept_id,
          d.field_1892 AS dept_name
        FROM database_table_248 ud
        JOIN database_table_247 d ON d.id = cast(ud.field_1899 as integer)
        WHERE ud.field_1898 IS NOT NULL
          AND ud.field_1899 IS NOT NULL
          AND cast(ud.field_1899 as text) != '0'
        ORDER BY ud.field_1898, ud.id ASC
      )
      UPDATE database_table_225 c
      SET field_1901 = user_dept.dept_id,
          field_1902 = user_dept.dept_name
      FROM user_dept
      WHERE cast(c.field_1903 as text) = user_dept.user_id
        AND (c.field_1901 IS NULL OR cast(c.field_1901 as text) = '0' OR c.field_1901 = '')
        AND c.field_1903 IS NOT NULL
        AND cast(c.field_1903 as text) != '0'
        AND ${instFilter}
    `);

    const updated = (result as { rowCount?: number }).rowCount ?? 0;

    return NextResponse.json({
      updated,
      message: `${updated} casos atualizados com department_id baseado no responsável`,
    });
  } catch (error) {
    console.error("[backfill-departments] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao executar backfill", details: String(error) },
      { status: 500 },
    );
  }
}

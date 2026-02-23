import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { fetchPermissionsStatus } from "@/services/permissions";
import { createBaserowCase, getBaserowCases } from "@/services/api";

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

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json(
        { error: "Identificador do usuário ausente" },
        { status: 401 },
      );
    }

    // Check permissions: admin always allowed, regular users need "criar_caso" action
    const status = await fetchPermissionsStatus(auth.institutionId, legacyUserId);
    const isAdmin = status.isSysAdmin || status.isGlobalAdmin || status.isOfficeAdmin;
    const canCreateCase = isAdmin || (status.enabledActions ?? []).includes("criar_caso");

    if (!canCreateCase) {
      return NextResponse.json(
        { error: "Sem permissão para criar casos" },
        { status: 403 },
      );
    }

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

    // Verificar se já existe caso com o mesmo telefone para esta instituição
    if (phoneDigits.length >= 8) {
      const existing = await getBaserowCases({
        institutionId: auth.institutionId,
        pageSize: 1,
      });

      const duplicate = existing.results.find((row) => {
        const rowPhone = (row.CustumerPhone ?? "").replace(/\D/g, "");
        return rowPhone.length >= 8 && (
          rowPhone === phoneDigits ||
          rowPhone.endsWith(phoneDigits) ||
          phoneDigits.endsWith(rowPhone)
        );
      });

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

    const userName = (typeof auth.payload?.name === "string" ? auth.payload.name : "") || legacyUserId;

    const newCase = await createBaserowCase({
      CustumerName: parsed.data.customerName.trim(),
      CustumerPhone: phone,
      InstitutionID: auth.institutionId,
      Data: new Date().toISOString(),
      responsavel: userName,
      assigned_to_user_id: status.userId || null,
      case_source: "manual",
      created_by_user_id: status.userId || null,
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

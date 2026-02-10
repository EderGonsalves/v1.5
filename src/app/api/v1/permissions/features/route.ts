import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import {
  getInstitutionFeatures,
  updateInstitutionFeatures,
} from "@/services/permissions";

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

export async function GET(request: NextRequest) {
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

    const targetParam = request.nextUrl.searchParams.get("institutionId");
    const targetInstitutionId = targetParam ? Number(targetParam) : auth.institutionId;

    if (
      targetInstitutionId !== auth.institutionId &&
      auth.institutionId !== GLOBAL_ADMIN_INSTITUTION_ID
    ) {
      return NextResponse.json(
        { error: "Sem permissão para acessar esta instituição" },
        { status: 403 },
      );
    }

    const features = await getInstitutionFeatures(targetInstitutionId);
    return NextResponse.json({ features });
  } catch (error) {
    console.error("[api/v1/permissions/features] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar funcionalidades",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo deve ser um objeto JSON" },
        { status: 400 },
      );
    }

    const { institutionId: targetId, features } = body as Record<
      string,
      unknown
    >;
    const targetInstitutionId =
      typeof targetId === "number" && Number.isFinite(targetId)
        ? targetId
        : auth.institutionId;

    if (
      !features ||
      typeof features !== "object" ||
      Array.isArray(features)
    ) {
      return NextResponse.json(
        { error: "Campo 'features' deve ser um objeto { key: boolean }" },
        { status: 400 },
      );
    }

    await updateInstitutionFeatures({
      institutionId: auth.institutionId,
      legacyUserId,
      targetInstitutionId,
      features: features as Record<string, boolean>,
    });

    return NextResponse.json({ status: "updated" });
  } catch (error) {
    console.error("[api/v1/permissions/features] PUT error:", error);
    const status =
      error instanceof Error && error.message.includes("sysadmin")
        ? 403
        : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar funcionalidades",
      },
      { status },
    );
  }
}

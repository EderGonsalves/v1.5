import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import { getInstitutionWabaPhoneNumbers } from "@/lib/waba";
import { getBaserowConfigs } from "@/services/api";

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);

    if (!auth) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Permitir override do institutionId via query param (para admin)
    const searchParams = request.nextUrl.searchParams;
    const requestedInstitutionId = searchParams.get("institutionId");
    const debug = searchParams.get("debug") === "true";

    let institutionId = auth.institutionId;

    // Admin (institutionId=4) pode ver qualquer instituição
    if (requestedInstitutionId && auth.institutionId === 4) {
      institutionId = Number(requestedInstitutionId);
    }

    const wabaNumbers = await getInstitutionWabaPhoneNumbers(institutionId);

    // Debug: log configs para verificar estrutura dos dados
    const configs = await getBaserowConfigs(institutionId);
    console.log(`[waba/numbers] Institution ${institutionId}: ${configs.length} configs found`);
    configs.forEach((config, idx) => {
      const record = config as Record<string, unknown>;
      console.log(`[waba/numbers] Config ${idx + 1} (id=${config.id}):`, {
        waba_phone_number: record["waba_phone_number"],
        "body.waba_phone_number": record["body.waba_phone_number"],
        "body.tenant.wabaPhoneNumber": record["body.tenant.wabaPhoneNumber"],
        "body.tenant.phoneNumber": record["body.tenant.phoneNumber"],
      });
    });
    console.log(`[waba/numbers] Found ${wabaNumbers.length} unique numbers:`, wabaNumbers);

    // Modo debug: retornar informações extras
    if (debug) {
      return NextResponse.json({
        numbers: wabaNumbers,
        hasMultiple: wabaNumbers.length > 1,
        debug: {
          authInstitutionId: auth.institutionId,
          requestedInstitutionId: institutionId,
          configCount: configs.length,
          configs: configs.map((c) => ({
            id: c.id,
            waba_phone_number: (c as Record<string, unknown>)["waba_phone_number"],
            "body.waba_phone_number": (c as Record<string, unknown>)["body.waba_phone_number"],
            "body.auth.institutionId": (c as Record<string, unknown>)["body.auth.institutionId"],
          })),
        },
      });
    }

    return NextResponse.json({
      numbers: wabaNumbers,
      hasMultiple: wabaNumbers.length > 1,
    });
  } catch (error) {
    console.error("[waba/numbers] Erro ao buscar números:", error);
    return NextResponse.json(
      { error: "Erro ao buscar números WABA" },
      { status: 500 }
    );
  }
}

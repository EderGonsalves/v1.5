import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { fetchInstitutionUsers } from "@/services/permissions";

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyId = resolveLegacyIdentifier(auth);
    const email = (auth.payload?.email as string | undefined)?.toLowerCase();
    const users = await fetchInstitutionUsers(auth.institutionId);

    const currentUser = users.find((u) => {
      const uEmail = u.email.toLowerCase();
      if (email && uEmail === email) return true;
      if (legacyId && uEmail === legacyId.toLowerCase()) return true;
      if (legacyId && String(u.id) === legacyId) return true;
      return false;
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ user: currentUser }, { status: 200 });
  } catch (error) {
    console.error("[api/v1/users/me] GET error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar perfil do usuário",
      },
      { status: 500 },
    );
  }
}

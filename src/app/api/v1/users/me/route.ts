import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import { findUserInInstitution, fetchInstitutionUsers } from "@/services/permissions";

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyId = resolveLegacyIdentifier(auth);
    const email = (auth.payload?.email as string | undefined)?.toLowerCase();

    // Use robust triple matching (cached server-side)
    const rawUser = legacyId
      ? await findUserInInstitution(auth.institutionId, legacyId, email)
      : null;

    // Convert to public format
    const users = await fetchInstitutionUsers(auth.institutionId);
    const currentUser = rawUser
      ? users.find((u) => u.id === rawUser.id) ?? null
      : null;

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

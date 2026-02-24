import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import {
  getUserDepartmentIds,
  fetchInstitutionDepartments,
  isGlobalAdmin,
} from "@/services/departments";
import { findUserInInstitution } from "@/services/permissions";

export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Global admin (institution 4) sees everything, no department filtering
    if (isGlobalAdmin(auth.institutionId)) {
      const departments = await fetchInstitutionDepartments(auth.institutionId);
      return NextResponse.json(
        {
          departments,
          userDepartmentIds: [],
          isGlobalAdmin: true,
          isOfficeAdmin: false,
        },
        { status: 200 },
      );
    }

    // Resolve current user via robust triple matching (cached)
    const legacyId = resolveLegacyIdentifier(auth);
    const email = auth.payload?.email as string | undefined;

    const rawUser = legacyId
      ? await findUserInInstitution(auth.institutionId, legacyId, email)
      : null;

    const currentUser = rawUser
      ? {
          id: rawUser.id,
          name: (rawUser.name ?? "").trim(),
          email: (rawUser.email ?? "").trim(),
          isOfficeAdmin: rawUser.is_office_admin === true,
        }
      : null;

    if (!currentUser) {
      return NextResponse.json(
        {
          departments: [],
          userDepartmentIds: [],
          isGlobalAdmin: false,
          isOfficeAdmin: false,
          userId: null,
        },
        { status: 200 },
      );
    }

    const isAdmin = currentUser.isOfficeAdmin === true;

    const departments = await fetchInstitutionDepartments(auth.institutionId);

    // Office admins see all — no department filtering needed
    const userDepartmentIds = isAdmin
      ? []
      : await getUserDepartmentIds(currentUser.id, auth.institutionId);

    return NextResponse.json(
      {
        departments,
        userDepartmentIds,
        isGlobalAdmin: false,
        isOfficeAdmin: isAdmin,
        userId: currentUser.id,
        userName: currentUser.name,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/v1/departments/my] GET error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar departamentos do usuário",
      },
      { status: 500 },
    );
  }
}

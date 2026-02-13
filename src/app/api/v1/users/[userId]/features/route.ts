import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth, resolveLegacyIdentifier } from "@/lib/auth/session";
import {
  SYSTEM_FEATURES,
  ADMIN_DEFAULT_FEATURES,
  USER_ACTION_FEATURES,
} from "@/lib/feature-registry";
import {
  fetchPermissionsStatus,
  fetchUserFeatures,
  updateUserFeatures,
  fetchInstitutionUsers,
  fetchAllUsers,
} from "@/services/permissions";

type RouteContext = { params: Promise<{ userId: string }> };

const GLOBAL_ADMIN_INSTITUTION_ID = 4;

const updateFeaturesSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

// Resolve the institution of the target user
const resolveUserInstitution = async (
  authInstitutionId: number,
  userId: number,
): Promise<number> => {
  if (authInstitutionId !== GLOBAL_ADMIN_INSTITUTION_ID) {
    // Non-sysAdmin: target user belongs to same institution
    return authInstitutionId;
  }
  // SysAdmin: find the target user's institution
  const allUsers = await fetchAllUsers();
  const target = allUsers.find((u) => u.id === userId);
  return target?.institutionId ?? authInstitutionId;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json({ error: "Identificador do usuário ausente" }, { status: 401 });
    }
    const status = await fetchPermissionsStatus(auth.institutionId, legacyUserId);

    // Require admin
    if (!status.isSysAdmin && !status.isGlobalAdmin && !status.isOfficeAdmin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { userId: rawId } = await context.params;
    const userId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    const targetInstitutionId = await resolveUserInstitution(auth.institutionId, userId);
    const rows = await fetchUserFeatures(userId, targetInstitutionId);
    const rowByKey = new Map(rows.map((r) => [r.feature_key, r]));

    // Build features list for ADMIN_DEFAULT_FEATURES + USER_ACTION_FEATURES
    const allConfigurableKeys = new Set([
      ...ADMIN_DEFAULT_FEATURES,
      ...USER_ACTION_FEATURES.map((f) => f.key),
    ]);
    const allConfigurableFeatures = [
      ...SYSTEM_FEATURES.filter((f) => allConfigurableKeys.has(f.key)),
      ...USER_ACTION_FEATURES.filter(
        (f) => !SYSTEM_FEATURES.some((sf) => sf.key === f.key),
      ),
    ];
    const features = allConfigurableFeatures.map((f) => {
      const row = rowByKey.get(f.key);
      const isEnabled = row
        ? typeof row.is_enabled === "boolean"
          ? row.is_enabled
          : String(row.is_enabled).toLowerCase() === "true"
        : false;
      return {
        key: f.key,
        label: f.label,
        path: f.path,
        isEnabled,
      };
    });

    return NextResponse.json({ features });
  } catch (error) {
    console.error("[GET /users/[userId]/features]", error);
    return NextResponse.json(
      { error: "Erro ao buscar permissões do usuário" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const legacyUserId = resolveLegacyIdentifier(auth);
    if (!legacyUserId) {
      return NextResponse.json({ error: "Identificador do usuário ausente" }, { status: 401 });
    }
    const status = await fetchPermissionsStatus(auth.institutionId, legacyUserId);

    // Require admin
    if (!status.isSysAdmin && !status.isGlobalAdmin && !status.isOfficeAdmin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { userId: rawId } = await context.params;
    const userId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateFeaturesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Allow ADMIN_DEFAULT_FEATURES + USER_ACTION_FEATURES keys
    const validKeys = new Set([
      ...ADMIN_DEFAULT_FEATURES,
      ...USER_ACTION_FEATURES.map((f) => f.key),
    ]);
    const filtered: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(parsed.data.features)) {
      if (validKeys.has(key)) {
        filtered[key] = val;
      }
    }

    const targetInstitutionId = await resolveUserInstitution(auth.institutionId, userId);
    await updateUserFeatures(userId, targetInstitutionId, filtered);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PUT /users/[userId]/features]", error);
    return NextResponse.json(
      { error: "Erro ao atualizar permissões do usuário" },
      { status: 500 },
    );
  }
}

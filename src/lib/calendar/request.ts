import { NextRequest } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";

type UnknownRecord = Record<string, unknown>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const extractFromBody = (body?: UnknownRecord | null): number | null => {
  if (!body) {
    return null;
  }

  const direct =
    toNumber(body.institutionId) ??
    toNumber(body.InstitutionID) ??
    toNumber(body.institution_id);
  if (direct) {
    return direct;
  }

  const auth = body.auth;
  if (auth && typeof auth === "object" && auth !== null) {
    return toNumber((auth as UnknownRecord).institutionId);
  }

  return null;
};

export const resolveInstitutionId = (
  request: NextRequest,
  body?: UnknownRecord | null,
): number | null => {
  const searchParams = request.nextUrl.searchParams;
  const queryInstitution =
    searchParams.get("institutionId") ?? searchParams.get("institution_id");
  const headerInstitution =
    request.headers.get("x-institution-id") ??
    request.headers.get("x-inst-id") ??
    request.headers.get("x-tenant-id");

  const auth = getRequestAuth(request);

  return (
    toNumber(queryInstitution) ??
    toNumber(headerInstitution) ??
    extractFromBody(body) ??
    (auth ? auth.institutionId : null)
  );
};

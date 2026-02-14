import { NextRequest } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import type { AuthInfo } from "@/lib/validations";

const CALENDAR_API_KEY = process.env.CALENDAR_API_KEY;
const SYSADMIN_INSTITUTION_ID = 4;

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

/**
 * Authenticates calendar requests via cookie OR Bearer API key (for N8N / server-to-server).
 * When authenticated via API key, returns a SysAdmin-level auth object.
 */
export const getCalendarAuth = (request: NextRequest): AuthInfo | null => {
  // 1. Cookie auth (browser / logged-in user)
  const cookieAuth = getRequestAuth(request);
  if (cookieAuth) return cookieAuth;

  // 2. Bearer token (server-to-server / N8N)
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (CALENDAR_API_KEY && bearer && bearer === CALENDAR_API_KEY) {
    return { institutionId: SYSADMIN_INSTITUTION_ID };
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

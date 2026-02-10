import type { NextRequest } from "next/server";

import type { AuthInfo } from "@/lib/validations";

import { ONBOARDING_AUTH_COOKIE } from "./constants";
import { ensureLegacyUserIdentifier, extractLegacyUserId } from "./user";

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const sanitizeAuth = (value: unknown): AuthInfo | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AuthInfo>;
  const institutionId = coerceNumber(candidate.institutionId);
  if (!institutionId) {
    return null;
  }

  const sanitized: AuthInfo = {
    institutionId,
    token:
      typeof candidate.token === "string" && candidate.token.length > 0
        ? candidate.token
        : undefined,
    expiresAt:
      typeof candidate.expiresAt === "string" && candidate.expiresAt.length > 0
        ? candidate.expiresAt
        : undefined,
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? (candidate.payload as Record<string, unknown>)
        : undefined,
    legacyUserId:
      typeof candidate.legacyUserId === "string" &&
      candidate.legacyUserId.trim().length > 0
        ? candidate.legacyUserId.trim()
        : undefined,
  };

  return sanitized;
};

export const parseAuthCookie = (rawValue?: string): AuthInfo | null => {
  if (!rawValue) {
    return null;
  }

  let decoded = rawValue;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    // ignore decode errors
  }

  try {
    const parsed = JSON.parse(decoded);
    return sanitizeAuth(parsed);
  } catch {
    return null;
  }
};

export const getRequestAuth = (request: NextRequest): AuthInfo | null => {
  const cookie = request.cookies.get(ONBOARDING_AUTH_COOKIE);
  if (!cookie?.value) {
    return null;
  }
  return parseAuthCookie(cookie.value);
};

export const resolveLegacyIdentifier = (auth: AuthInfo): string | null => {
  const ensured = ensureLegacyUserIdentifier(auth);
  if (ensured.legacyUserId && ensured.legacyUserId.trim().length > 0) {
    return ensured.legacyUserId.trim();
  }
  return extractLegacyUserId(ensured.payload) ?? null;
};

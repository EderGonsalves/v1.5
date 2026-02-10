import type { AuthInfo } from "@/lib/validations";

type GenericPayload = Record<string, unknown> | undefined | null;

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

const getNestedValue = (payload: GenericPayload, path: string): unknown => {
  if (!payload) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, payload);
};

const buildExtractor =
  (paths: string[]) =>
  (payload: GenericPayload, fallback?: string): string | undefined => {
    for (const path of paths) {
      const raw = getNestedValue(payload, path);
      const normalized = coerceString(raw);
      if (normalized) {
        return normalized;
      }
    }
    return fallback;
  };

const LEGACY_USER_PATHS = [
  "user.id",
  "userId",
  "user_id",
  "legacyUserId",
  "legacy_user_id",
  "user.profile.id",
  "id",
  "user.email",
  "email",
  "user.profile.email",
];

const DISPLAY_NAME_PATHS = [
  "user.name",
  "name",
  "full_name",
  "displayName",
  "user.profile.name",
];

export const extractLegacyUserId = buildExtractor(LEGACY_USER_PATHS);
export const extractDisplayName = buildExtractor(DISPLAY_NAME_PATHS);

export const ensureLegacyUserIdentifier = (auth: AuthInfo): AuthInfo => {
  if (auth.legacyUserId && auth.legacyUserId.trim().length > 0) {
    return auth;
  }

  const fallback = extractLegacyUserId(auth.payload);
  if (fallback) {
    return {
      ...auth,
      legacyUserId: fallback,
    };
  }

  return auth;
};

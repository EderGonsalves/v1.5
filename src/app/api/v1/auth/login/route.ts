import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { setAuthCookie } from "@/lib/auth/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { authenticate } from "@/services/api";
import { authenticateViaUsersTable } from "@/services/permissions";
import { extractLegacyUserId } from "@/lib/auth/user";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// 10 login attempts per 5 minutes per IP
const loginLimiter = createRateLimiter({
  maxRequests: 10,
  windowSeconds: 5 * 60,
});

const getClientIp = (request: NextRequest): string => {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
};

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = loginLimiter.check(clientIp);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Muitas tentativas de login. Tente novamente em alguns minutos.",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios" },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    // 1. Try webhook authentication first
    try {
      const authInfo = await authenticate({ email, password });
      const legacyUserId =
        extractLegacyUserId(authInfo.payload, email) ?? email;

      const authData = {
        institutionId: authInfo.institutionId,
        token: authInfo.token,
        expiresAt: authInfo.expiresAt,
        payload: authInfo.payload,
        legacyUserId,
      };
      const response = NextResponse.json(authData);
      setAuthCookie(response, authData);
      return response;
    } catch (webhookError) {
      console.error(
        "[api/v1/auth/login] webhook auth failed:",
        webhookError instanceof Error ? webhookError.message : webhookError,
      );
    }

    // 2. Fallback: authenticate via Users table
    try {
      const usersResult = await authenticateViaUsersTable(email, password);
      if (usersResult) {
        const authData = {
          institutionId: usersResult.institutionId,
          legacyUserId: String(usersResult.userId),
          payload: {
            name: usersResult.name,
            email: usersResult.email,
          },
        };
        const response = NextResponse.json(authData);
        setAuthCookie(response, authData);
        return response;
      }
      console.error(
        "[api/v1/auth/login] users table auth returned null for email:",
        email,
      );
    } catch (usersError) {
      console.error(
        "[api/v1/auth/login] users table auth error:",
        usersError instanceof Error ? usersError.message : usersError,
      );
    }

    // Both failed
    return NextResponse.json(
      { error: "Credenciais inválidas" },
      { status: 401 },
    );
  } catch (error) {
    console.error("[api/v1/auth/login] error", error);
    return NextResponse.json(
      { error: "Erro ao autenticar" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/services/api";
import { authenticateViaUsersTable } from "@/services/permissions";
import { extractLegacyUserId } from "@/lib/auth/user";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
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

      return NextResponse.json({
        institutionId: authInfo.institutionId,
        token: authInfo.token,
        expiresAt: authInfo.expiresAt,
        payload: authInfo.payload,
        legacyUserId,
      });
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
        return NextResponse.json({
          institutionId: usersResult.institutionId,
          legacyUserId: String(usersResult.userId),
          payload: {
            name: usersResult.name,
            email: usersResult.email,
          },
        });
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao autenticar",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { syncUserRecord } from "@/services/permissions";

const payloadSchema = z.object({
  institutionId: z.coerce.number().int().positive(),
  legacyUserId: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const { institutionId, legacyUserId, email, name, isActive } =
      payloadSchema.parse(json);

    const result = await syncUserRecord({
      institutionId,
      legacyUserId,
      email: email?.toLowerCase(),
      name,
      isActive,
    });

    return NextResponse.json(
      {
        status: result.created ? "created" : "updated",
        userId: result.user.id,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("[api/v1/auth/sync-user] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar usuário",
      },
      { status: 500 },
    );
  }
}

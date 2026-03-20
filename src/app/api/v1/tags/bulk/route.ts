import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { bulkAssignTags } from "@/services/tags";

const TAGS_API_KEY = process.env.TAGS_API_KEY;

const bulkSchema = z.object({
  caseIds: z.array(z.number().int().positive()).max(1000),
  tagIds: z.array(z.number().int().positive()).max(50),
  institutionId: z.number().int().positive(),
  assignedBy: z.string().default("ai"),
  confidence: z.number().min(0).max(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Auth via API key (for AI agent)
    const authHeader = request.headers.get("Authorization");
    if (!TAGS_API_KEY || !authHeader) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (token !== TAGS_API_KEY) {
      return NextResponse.json({ error: "API key inválida" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const { caseIds, tagIds, institutionId, assignedBy, confidence } = parsed.data;
    const count = await bulkAssignTags(caseIds, tagIds, institutionId, assignedBy, confidence);

    return NextResponse.json(
      { message: `${count} associações criadas`, count },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/v1/tags/bulk] POST error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no bulk assign" },
      { status: 500 },
    );
  }
}

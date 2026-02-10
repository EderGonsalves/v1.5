import { NextRequest, NextResponse } from "next/server";

import type { ZodIssue } from "zod";

import { eventBelongsToInstitution } from "@/lib/calendar/event-helpers";
import { resolveInstitutionId } from "@/lib/calendar/request";
import { calendarGuestSchema } from "@/lib/calendar/schemas";
import {
  createCalendarEventGuest,
  getCalendarEventById,
} from "@/services/api";

const respondWithError = (message: string, status = 400) => {
  return NextResponse.json({ error: message }, { status });
};

type RouteParams = {
  params: Promise<{ eventId?: string }>;
};

const parseEventId = (value?: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const extractEventId = async (params: RouteParams["params"]): Promise<number | null> => {
  const resolved = await params;
  return parseEventId(resolved?.eventId);
};

const formatValidationError = (issues: ZodIssue[]) => {
  return issues
    .map((issue) => {
      const normalizedPath = issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      );
      if (normalizedPath.length > 0) {
        return `${normalizedPath.join(".")}: ${issue.message}`;
      }
      return issue.message;
    })
    .join("; ");
};

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
) {
  try {
    const eventId = await extractEventId(params);
    if (!eventId) {
      return respondWithError("eventId inválido na URL.");
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return respondWithError("JSON inválido.");
    }

    if (!parsedBody || typeof parsedBody !== "object") {
      return respondWithError("Corpo da requisição deve ser um objeto JSON válido.");
    }

    const institutionId = resolveInstitutionId(
      request,
      parsedBody as Record<string, unknown>,
    );
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header, cookie ou body.auth.institutionId).",
      );
    }

    const parseResult = calendarGuestSchema.safeParse(parsedBody);
    if (!parseResult.success) {
      return respondWithError(
        formatValidationError(parseResult.error.issues),
        422,
      );
    }

    const event = await getCalendarEventById(eventId);
    if (!event || event.deleted_at) {
      return respondWithError("Evento não encontrado.", 404);
    }

    if (!eventBelongsToInstitution(event, institutionId)) {
      return respondWithError("Evento não pertence à instituição informada.", 403);
    }

    const timestamp = new Date().toISOString();
    const guest = await createCalendarEventGuest({
      event_id: eventId,
      name: parseResult.data.name,
      email: parseResult.data.email,
      phone: parseResult.data.phone,
      created_at: timestamp,
      updated_at: timestamp,
    });

    return NextResponse.json(
      { id: guest.id, status: "created" },
      { status: 201 },
    );
  } catch (error) {
    console.error("[calendar/events/:id/guests] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao adicionar convidado",
      },
      { status: 500 },
    );
  }
}


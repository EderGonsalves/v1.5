import type { ZodIssue } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { eventBelongsToInstitution } from "@/lib/calendar/event-helpers";
import { resolveInstitutionId } from "@/lib/calendar/request";
import { calendarEventUpdateSchema, type CalendarEventUpdateInput } from "@/lib/calendar/schemas";
import {
  deleteCalendarEvent,
  getCalendarEventById,
  listCalendarEventGuests,
  updateCalendarEvent,
  type CalendarEventRow,
  type UpdateCalendarEventPayload,
} from "@/services/api";
import { serializeEvent, toTextFlag } from "../utils";

const respondWithError = (message: string, status = 400) => {
  return NextResponse.json({ error: message }, { status });
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

const buildUpdatePayload = (
  data: CalendarEventUpdateInput,
): UpdateCalendarEventPayload => {
  const payload: UpdateCalendarEventPayload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.start_datetime !== undefined) payload.start_datetime = data.start_datetime;
  if (data.end_datetime !== undefined) payload.end_datetime = data.end_datetime;
  if (data.timezone !== undefined) payload.timezone = data.timezone;
  if (data.location !== undefined) payload.location = data.location;
  if (data.meeting_link !== undefined) payload.meeting_link = data.meeting_link;
  if (data.reminder_minutes_before !== undefined) {
    payload.reminder_minutes_before = data.reminder_minutes_before;
  }
  if (data.user_id !== undefined) payload.user_id = data.user_id;
  if (data.google_event_id !== undefined) payload.google_event_id = data.google_event_id;
  if (data.sync_status !== undefined) payload.sync_status = data.sync_status;
  if (data.deleted_at !== undefined) payload.deleted_at = data.deleted_at;

  if (data.notify_by_email !== undefined) {
    payload.notify_by_email = toTextFlag(data.notify_by_email);
  }

  if (data.notify_by_phone !== undefined) {
    payload.notify_by_phone = toTextFlag(data.notify_by_phone);
  }

  payload.updated_at = new Date().toISOString();

  return payload;
};

const ensureEventAccess = (
  event: CalendarEventRow | null,
  institutionId: number,
) => {
  if (!event || event.deleted_at) {
    return respondWithError("Evento não encontrado.", 404);
  }

  if (!eventBelongsToInstitution(event, institutionId)) {
    return respondWithError("Evento não pertence à instituição informada.", 403);
  }

  return null;
};

type RouteParams = {
  params: Promise<{ eventId?: string }>;
};

const extractEventId = async (params: RouteParams["params"]): Promise<number | null> => {
  const resolved = await params;
  return parseEventId(resolved?.eventId);
};

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
) {
  try {
    const eventId = await extractEventId(params);
    if (!eventId) {
      return respondWithError("eventId inválido na URL.");
    }

    const institutionId = resolveInstitutionId(request);
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header ou cookie).",
      );
    }

    const event = await getCalendarEventById(eventId);
    const ownershipError = ensureEventAccess(event, institutionId);
    if (ownershipError) {
      return ownershipError;
    }
    const normalizedEvent = event as CalendarEventRow;

    const guests = await listCalendarEventGuests(eventId);
    return NextResponse.json(serializeEvent(normalizedEvent, guests));
  } catch (error) {
    console.error("[calendar/events/:id] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao buscar evento",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
) {
  try {
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return respondWithError("JSON inválido.");
    }

    const rawBody = parsedBody;
    if (!rawBody || typeof rawBody !== "object") {
      return respondWithError("Corpo da requisição deve ser um objeto JSON válido.");
    }

    const eventId = await extractEventId(params);
    if (!eventId) {
      return respondWithError("eventId inválido na URL.");
    }

    const institutionId = resolveInstitutionId(
      request,
      rawBody as Record<string, unknown>,
    );
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header, cookie ou body.auth.institutionId).",
      );
    }

    const parseResult = calendarEventUpdateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return respondWithError(
        formatValidationError(parseResult.error.issues),
        422,
      );
    }

    const event = await getCalendarEventById(eventId);
    const ownershipError = ensureEventAccess(event, institutionId);
    if (ownershipError) {
      return ownershipError;
    }

    const payload = buildUpdatePayload(parseResult.data);
    await updateCalendarEvent(eventId, payload);

    return NextResponse.json({ status: "updated" });
  } catch (error) {
    console.error("[calendar/events/:id] PUT error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao atualizar evento",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
) {
  try {
    const eventId = await extractEventId(params);
    if (!eventId) {
      return respondWithError("eventId inválido na URL.");
    }

    const institutionId = resolveInstitutionId(request);
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header ou cookie).",
      );
    }

    const event = await getCalendarEventById(eventId);
    const ownershipError = ensureEventAccess(event, institutionId);
    if (ownershipError) {
      return ownershipError;
    }

    await deleteCalendarEvent(eventId);

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("[calendar/events/:id] DELETE error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao excluir evento",
      },
      { status: 500 },
    );
  }
}












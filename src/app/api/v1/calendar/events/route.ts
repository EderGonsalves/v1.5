import type { ZodIssue } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { resolveInstitutionId } from "@/lib/calendar/request";
import { calendarEventInputSchema } from "@/lib/calendar/schemas";
import {
  createCalendarEvent,
  createCalendarEventGuest,
  listCalendarEvents,
  type CreateCalendarEventPayload,
} from "@/services/api";
import { serializeEvent, toTextFlag } from "./utils";

const respondWithError = (message: string, status = 400) => {
  return NextResponse.json({ error: message }, { status });
};

const normalizeDateParam = (
  value: string | null,
  options?: { isEnd?: boolean },
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(trimmed)) {
    return options?.isEnd
      ? `${trimmed}T23:59:59.999Z`
      : `${trimmed}T00:00:00Z`;
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
};

export async function GET(request: NextRequest) {
  try {
    const institutionId = resolveInstitutionId(request);
    if (!institutionId) {
      return respondWithError("institutionId é obrigatório na query, header ou cookie");
    }

    const rawStart = request.nextUrl.searchParams.get("start");
    const rawEnd = request.nextUrl.searchParams.get("end");

    const start = normalizeDateParam(rawStart);
    if (rawStart && !start) {
      return respondWithError("Parâmetro 'start' inválido. Use YYYY-MM-DD ou datetime UTC.");
    }

    const end = normalizeDateParam(rawEnd, { isEnd: true });
    if (rawEnd && !end) {
      return respondWithError("Parâmetro 'end' inválido. Use YYYY-MM-DD ou datetime UTC.");
    }

    const events = await listCalendarEvents({
      institutionId,
      start,
      end,
    });

    return NextResponse.json(events.map((event) => serializeEvent(event)));
  } catch (error) {
    console.error("[calendar/events] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao listar eventos",
      },
      { status: 500 },
    );
  }
}

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

export async function POST(request: NextRequest) {
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

    const institutionId = resolveInstitutionId(
      request,
      rawBody as Record<string, unknown>,
    );
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header, cookie ou body.auth.institutionId).",
      );
    }

    const parseResult = calendarEventInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return respondWithError(
        formatValidationError(parseResult.error.issues),
        422,
      );
    }

    const data = parseResult.data;

    const payload: CreateCalendarEventPayload = {
      InstitutionID: institutionId,
      title: data.title,
      description: data.description,
      start_datetime: data.start_datetime,
      end_datetime: data.end_datetime,
      timezone: data.timezone,
      location: data.location,
      meeting_link: data.meeting_link,
      reminder_minutes_before: data.reminder_minutes_before,
      notify_by_email: toTextFlag(data.notify_by_email),
      notify_by_phone: toTextFlag(data.notify_by_phone),
    };

    const nowIso = new Date().toISOString();
    payload.created_at = nowIso;
    payload.updated_at = nowIso;

    if (typeof data.user_id === "number" && Number.isFinite(data.user_id)) {
      payload.user_id = data.user_id;
    }

    const event = await createCalendarEvent(payload);

    if (data.guests.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        data.guests.map((guest) =>
          createCalendarEventGuest({
            event_id: event.id,
            name: guest.name,
            email: guest.email,
            phone: guest.phone,
            created_at: now,
            updated_at: now,
          }),
        ),
      );
    }

    return NextResponse.json(
      { id: event.id, status: "created" },
      { status: 201 },
    );
  } catch (error) {
    console.error("[calendar/events] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao criar evento",
      },
      { status: 500 },
    );
  }
}

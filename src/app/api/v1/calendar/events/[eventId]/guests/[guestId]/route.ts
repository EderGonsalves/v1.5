import { NextRequest, NextResponse } from "next/server";

import { eventBelongsToInstitution } from "@/lib/calendar/event-helpers";
import { resolveInstitutionId } from "@/lib/calendar/request";
import {
  deleteCalendarEventGuest,
  getCalendarEventById,
  getCalendarEventGuestById,
  type CalendarEventGuestRow,
} from "@/services/api";

const respondWithError = (message: string, status = 400) => {
  return NextResponse.json({ error: message }, { status });
};

type RouteParams = {
  params: Promise<{ eventId?: string; guestId?: string }>;
};

const parseId = (value?: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const guestBelongsToEvent = (
  guest: CalendarEventGuestRow | null,
  eventId: number,
): boolean => {
  if (!guest?.event_id?.length) {
    return false;
  }
  return guest.event_id.some((relation) => relation.id === eventId);
};

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
) {
  try {
    const resolvedParams = await params;
    const eventId = parseId(resolvedParams?.eventId);
    const guestId = parseId(resolvedParams?.guestId);

    if (!eventId || !guestId) {
      return respondWithError("eventId e guestId são obrigatórios na URL.");
    }

    const institutionId = resolveInstitutionId(request);
    if (!institutionId) {
      return respondWithError(
        "institutionId é obrigatório (query, header ou cookie).",
      );
    }

    const event = await getCalendarEventById(eventId);
    if (!event || event.deleted_at) {
      return respondWithError("Evento não encontrado.", 404);
    }

    if (!eventBelongsToInstitution(event, institutionId)) {
      return respondWithError("Evento não pertence à instituição informada.", 403);
    }

    const guest = await getCalendarEventGuestById(guestId);
    if (!guest) {
      return respondWithError("Convidado não encontrado.", 404);
    }

    if (!guestBelongsToEvent(guest, eventId)) {
      return respondWithError(
        "Convidado não está associado ao evento informado.",
        409,
      );
    }

    await deleteCalendarEventGuest(guestId);

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("[calendar/events/:id/guests/:guestId] DELETE error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao remover convidado",
      },
      { status: 500 },
    );
  }
}

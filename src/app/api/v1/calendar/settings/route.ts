import { NextRequest, NextResponse } from "next/server";
import {
  fetchCalendarSettings,
  upsertCalendarSettings,
} from "@/services/calendar-settings";
import { getRequestAuth } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const settings = await fetchCalendarSettings(auth.institutionId);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("Erro ao buscar calendar settings:", err);
    return NextResponse.json(
      { error: "Erro ao buscar configurações da agenda" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate numeric fields
    const numericFields = [
      "slot_duration_minutes",
      "buffer_minutes",
      "advance_days",
    ];
    for (const field of numericFields) {
      if (field in body) {
        const val = Number(body[field]);
        if (!Number.isFinite(val) || val < 0) {
          return NextResponse.json(
            { error: `Campo ${field} deve ser um número positivo` },
            { status: 400 },
          );
        }
        body[field] = val;
      }
    }

    // Validate time fields (HH:mm format or empty)
    const timeFields = [
      "mon_start", "mon_end",
      "tue_start", "tue_end",
      "wed_start", "wed_end",
      "thu_start", "thu_end",
      "fri_start", "fri_end",
      "sat_start", "sat_end",
      "sun_start", "sun_end",
    ];
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const field of timeFields) {
      if (field in body) {
        const val = String(body[field]).trim();
        if (val !== "" && !timeRegex.test(val)) {
          return NextResponse.json(
            { error: `Campo ${field} deve estar no formato HH:mm ou vazio` },
            { status: 400 },
          );
        }
        body[field] = val;
      }
    }

    // Remove fields that shouldn't be set by client
    delete body.id;
    delete body.institution_id;
    delete body.created_at;
    delete body.updated_at;

    const settings = await upsertCalendarSettings(auth.institutionId, body);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("Erro ao salvar calendar settings:", err);
    return NextResponse.json(
      { error: "Erro ao salvar configurações da agenda" },
      { status: 500 },
    );
  }
}

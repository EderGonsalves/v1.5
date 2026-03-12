import { NextRequest, NextResponse } from "next/server";

import { getCalendarAuth } from "@/lib/calendar/request";
import { fetchInstitutionUsers } from "@/services/permissions";
import { listCalendarEvents } from "@/services/api";
import { fetchCalendarSettings } from "@/services/calendar-settings";

const SYSADMIN_INSTITUTION_ID = 4;

/**
 * GET /api/v1/calendar/next-assignee?institutionId=123
 *
 * Round-robin: retorna o user_id do próximo responsável para agendamento.
 * Escolhe o usuário com agenda habilitada que tem MENOS eventos futuros.
 *
 * Resposta:
 *   { user_id: number, user_name: string, scheduling_enabled: true }
 *   ou { user_id: null, scheduling_enabled: false } se ninguém tem agenda.
 */
export async function GET(request: NextRequest) {
  const auth = getCalendarAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const institutionIdParam = request.nextUrl.searchParams.get("institutionId");
  if (!institutionIdParam) {
    return NextResponse.json(
      { error: "institutionId é obrigatório" },
      { status: 400 },
    );
  }

  const institutionId = Number(institutionIdParam);
  if (!Number.isFinite(institutionId) || institutionId <= 0) {
    return NextResponse.json(
      { error: "institutionId inválido" },
      { status: 400 },
    );
  }

  if (
    auth.institutionId !== SYSADMIN_INSTITUTION_ID &&
    auth.institutionId !== institutionId
  ) {
    return NextResponse.json(
      { error: "Acesso não autorizado" },
      { status: 403 },
    );
  }

  try {
    // 1. Buscar usuários com agenda habilitada
    let allUsers;
    try {
      allUsers = await fetchInstitutionUsers(institutionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[next-assignee] fetchInstitutionUsers failed:", msg);
      return NextResponse.json(
        { error: "Erro ao buscar usuários", detail: msg },
        { status: 500 },
      );
    }

    const agendaUsers = allUsers.filter(
      (u) => u.agendaEnabled && u.isActive,
    );

    if (agendaUsers.length === 0) {
      // Fallback: verificar se existe config institucional com scheduling habilitado
      let instSettings;
      try {
        instSettings = await fetchCalendarSettings(institutionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[next-assignee] fetchCalendarSettings failed:", msg);
        return NextResponse.json(
          { error: "Erro ao buscar config de agenda", detail: msg },
          { status: 500 },
        );
      }
      const instEnabled = instSettings?.scheduling_enabled === true ||
        String(instSettings?.scheduling_enabled) === "true";

      return NextResponse.json({
        user_id: null,
        user_name: null,
        scheduling_enabled: instEnabled,
        count: 0,
        results: [],
      });
    }

    // Se só tem 1 usuário, retorna direto
    if (agendaUsers.length === 1) {
      return NextResponse.json({
        user_id: agendaUsers[0].id,
        user_name: agendaUsers[0].name || agendaUsers[0].email,
        scheduling_enabled: true,
        count: 1,
        results: [
          {
            user_id: agendaUsers[0].id,
            user_name: agendaUsers[0].name || agendaUsers[0].email,
          },
        ],
      });
    }

    // 2. Buscar eventos futuros para round-robin
    const now = new Date();
    let futureEvents;
    try {
      futureEvents = await listCalendarEvents({
        institutionId,
        start: now.toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[next-assignee] listCalendarEvents failed:", msg);
      return NextResponse.json(
        { error: "Erro ao buscar eventos", detail: msg },
        { status: 500 },
      );
    }

    // 3. Contar eventos por user_id
    const eventCountMap = new Map<number, number>();
    for (const u of agendaUsers) {
      eventCountMap.set(u.id, 0);
    }
    for (const ev of futureEvents) {
      const uid = ev.user_id != null ? Number(ev.user_id) : null;
      if (uid != null && eventCountMap.has(uid)) {
        eventCountMap.set(uid, (eventCountMap.get(uid) ?? 0) + 1);
      }
    }

    // 4. Escolher o usuário com menos eventos (round-robin por carga)
    let minCount = Infinity;
    let chosen = agendaUsers[0];
    for (const u of agendaUsers) {
      const count = eventCountMap.get(u.id) ?? 0;
      if (count < minCount) {
        minCount = count;
        chosen = u;
      }
    }

    return NextResponse.json({
      user_id: chosen.id,
      user_name: chosen.name || chosen.email,
      scheduling_enabled: true,
      count: agendaUsers.length,
      results: agendaUsers.map((u) => ({
        user_id: u.id,
        user_name: u.name || u.email,
        event_count: eventCountMap.get(u.id) ?? 0,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[calendar/next-assignee] GET error:", message, stack);
    return NextResponse.json(
      { error: "Erro ao determinar próximo responsável", detail: message },
      { status: 500 },
    );
  }
}

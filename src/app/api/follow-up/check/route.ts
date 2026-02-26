import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth/session";
import {
  getBaserowCases,
  getBaserowConfigs,
  getFollowUpConfigs,
  getFollowUpHistory,
  createFollowUpHistory,
  type BaserowCaseRow,
  type FollowUpConfigRow,
} from "@/services/api";
import { fetchCaseMessagesFromBaserow } from "@/lib/chat/baserow";
import type { CaseMessage } from "@/lib/chat/types";
import { getInstitutionWabaPhoneNumber } from "@/lib/waba";

const CRON_SECRET = process.env.CRON_SECRET || "";

// Webhook específico para follow-up (separado do webhook de chat)
const FOLLOW_UP_WEBHOOK_URL = process.env.FOLLOW_UP_WEBHOOK_URL ?? "";
const FOLLOW_UP_WEBHOOK_TOKEN = process.env.FOLLOW_UP_WEBHOOK_TOKEN ?? "";
const FOLLOW_UP_WEBHOOK_TIMEOUT =
  Number(process.env.FOLLOW_UP_WEBHOOK_TIMEOUT_MS ?? 20000) || 20000;

type DayOfWeek = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

const DAY_MAP: Record<number, DayOfWeek> = {
  0: "dom",
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

const _brtFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatDateTimeBR = (date: Date): string => {
  const parts = _brtFmt.formatToParts(date);
  const v = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
};

type ChatWebhookPayload = {
  display_phone_number: string;
  to: string;
  text: string;
  DataHora: string;
  field: string;
  messages_type: "text";
  CaseID: string | number;
  institution_id: number;
  waba_phone_id: string;
};

const dispatchFollowUpWebhook = async (payload: ChatWebhookPayload): Promise<boolean> => {
  if (!FOLLOW_UP_WEBHOOK_URL) {
    console.warn("[follow-up] FOLLOW_UP_WEBHOOK_URL não definido");
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FOLLOW_UP_WEBHOOK_TIMEOUT);

  try {
    const response = await fetch(FOLLOW_UP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(FOLLOW_UP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${FOLLOW_UP_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Erro desconhecido");
      console.error(`[follow-up] Webhook erro ${response.status}: ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[follow-up] Falha ao enviar webhook:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const isConfigActive = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["sim", "yes", "true", "1", "ativo"].includes(normalized);
};

const parseAllowedDays = (value: string | undefined): DayOfWeek[] => {
  if (!value) return ["seg", "ter", "qua", "qui", "sex"];
  return value.split(",").map((d) => d.trim().toLowerCase() as DayOfWeek).filter(Boolean);
};

const parseTime = (timeStr: string): { hours: number; minutes: number } => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
};

// Converte uma data UTC para o horário de São Paulo (UTC-3)
const toSaoPauloTime = (date: Date): Date => {
  // Criar uma cópia da data no timezone de São Paulo
  const saoPauloOffset = -3 * 60; // UTC-3 em minutos
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcTime + saoPauloOffset * 60000);
};

const isWithinAllowedTime = (
  config: FollowUpConfigRow,
  now: Date,
): boolean => {
  // Usar horário de São Paulo para verificação
  const saoPauloNow = toSaoPauloTime(now);

  const currentDay = DAY_MAP[saoPauloNow.getDay()];
  const allowedDays = parseAllowedDays(config.allowed_days);

  if (!allowedDays.includes(currentDay)) {
    return false;
  }

  const currentHours = saoPauloNow.getHours();
  const currentMinutes = saoPauloNow.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  const startTime = parseTime(config.allowed_start_time ?? "08:00");
  const endTime = parseTime(config.allowed_end_time ?? "18:00");

  const startTotalMinutes = startTime.hours * 60 + startTime.minutes;
  const endTotalMinutes = endTime.hours * 60 + endTime.minutes;

  // Validação: se end_time < start_time, configuração inválida - retornar false
  if (endTotalMinutes < startTotalMinutes) {
    console.warn(
      `[follow-up] Configuração inválida: horário fim (${config.allowed_end_time}) é anterior ao horário início (${config.allowed_start_time})`
    );
    return false;
  }

  return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= endTotalMinutes;
};

const isCaseFinalized = (caseRow: BaserowCaseRow): boolean => {
  const etapaFinal = caseRow.EtapaFinal;
  if (!etapaFinal) return false;
  const normalized = String(etapaFinal).trim().toLowerCase();
  return ["sim", "yes", "true", "1", "finalizado", "completo"].includes(normalized);
};

const computeLastClientMessageAt = (messages: CaseMessage[]): Date | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const current = messages[index];
    if (current.sender === "cliente") {
      const date = new Date(current.createdAt);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }
  return null;
};

const buildCaseIdentifiers = (
  caseRow: BaserowCaseRow,
  rowId: number,
): Array<string | number> => {
  const identifiers: Array<string | number> = [];
  if (caseRow.CaseId !== null && caseRow.CaseId !== undefined) {
    identifiers.push(caseRow.CaseId);
  }
  identifiers.push(rowId);
  return identifiers;
};

type ProcessResult = {
  caseId: number;
  customerPhone: string;
  messageOrder: number;
  status: "success" | "failed" | "skipped";
  reason?: string;
};

const isAuthorized = (request: NextRequest): boolean => {
  // 1. Cookie auth (browser / logged-in user)
  if (getRequestAuth(request)) return true;
  // 2. Cron secret (server-to-server)
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (CRON_SECRET && bearer && bearer === CRON_SECRET) return true;
  return false;
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    // Optional: filter by institution_id in the request body
    let institutionId: number | undefined;
    try {
      const body = await request.json();
      if (body.institution_id) {
        institutionId = Number(body.institution_id);
      }
    } catch {
      // No body or invalid JSON - process all institutions
    }

    const now = new Date();
    const results: ProcessResult[] = [];

    // Get all cases (or filtered by institution)
    const { results: allCases } = await getBaserowCases({
      institutionId,
      fetchAll: true,
    });

    if (!allCases.length) {
      return NextResponse.json({
        processed: 0,
        results: [],
        message: "Nenhum caso encontrado",
      });
    }

    // Group cases by institution
    const casesByInstitution = new Map<number, BaserowCaseRow[]>();
    for (const caseRow of allCases) {
      const instId = Number(
        caseRow.InstitutionID ?? caseRow["body.auth.institutionId"] ?? 0
      );
      if (!instId) continue;

      if (!casesByInstitution.has(instId)) {
        casesByInstitution.set(instId, []);
      }
      casesByInstitution.get(instId)!.push(caseRow);
    }

    // Process each institution
    for (const [instId, cases] of casesByInstitution) {
      // Get follow-up configs for this institution
      const configs = await getFollowUpConfigs(instId);
      const activeConfigs = configs.filter((c) => isConfigActive(c.is_active));

      if (!activeConfigs.length) {
        continue;
      }

      // Check if any config is within allowed time
      const configsInTime = activeConfigs.filter((c) => isWithinAllowedTime(c, now));
      if (!configsInTime.length) {
        continue;
      }

      // Get office phone number and waba_phone_id for this institution
      const wabaPhone = await getInstitutionWabaPhoneNumber(instId);
      if (!wabaPhone) {
        console.warn(`[follow-up] Sem número WABA para instituição ${instId}`);
        continue;
      }

      // Get waba_phone_id from institution config
      let wabaPhoneId = "";
      try {
        const institutionConfigs = await getBaserowConfigs(instId);
        if (institutionConfigs.length > 0) {
          // Get the most recent config (highest id)
          const latestConfig = institutionConfigs.reduce(
            (current, candidate) => (candidate.id > current.id ? candidate : current),
            institutionConfigs[0]
          );
          wabaPhoneId = String(latestConfig.waba_phone_id ?? "");
        }
      } catch (configError) {
        console.warn(`[follow-up] Erro ao buscar waba_phone_id para instituição ${instId}:`, configError);
      }

      if (!wabaPhoneId) {
        console.warn(`[follow-up] Sem waba_phone_id para instituição ${instId}`);
        continue;
      }

      // Get follow-up history for this institution (last 24h)
      const history = await getFollowUpHistory(undefined, instId);
      const last24hHistory = history.filter((h) => {
        if (!h.sent_at) return false;
        const sentAt = new Date(h.sent_at);
        return now.getTime() - sentAt.getTime() < 24 * 60 * 60 * 1000;
      });

      // Process each case
      for (const caseRow of cases) {
        // Skip finalized cases
        if (isCaseFinalized(caseRow)) {
          continue;
        }

        const customerPhone = caseRow.CustumerPhone
          ? String(caseRow.CustumerPhone).trim()
          : "";
        if (!customerPhone) {
          continue;
        }

        // Check how many messages were sent to this case in last 24h
        // Normalizar comparação: case_id pode ser string ou número
        const caseHistory = last24hHistory.filter((h) =>
          String(h.case_id) === String(caseRow.id)
        );
        if (caseHistory.length >= 10) {
          results.push({
            caseId: caseRow.id,
            customerPhone,
            messageOrder: 0,
            status: "skipped",
            reason: "Limite de 10 mensagens em 24h atingido",
          });
          continue;
        }

        // Get messages for this case to find last client message
        const identifiers = buildCaseIdentifiers(caseRow, caseRow.id);
        let messages: CaseMessage[] = [];
        try {
          const fetchResult = await fetchCaseMessagesFromBaserow({
            caseIdentifiers: identifiers,
            customerPhone,
            fallbackCaseId: caseRow.id,
          });
          messages = fetchResult.messages;
        } catch (error) {
          console.error(`[follow-up] Erro ao buscar mensagens do caso ${caseRow.id}:`, error);
          continue;
        }

        const lastClientMessageAt = computeLastClientMessageAt(messages);
        if (!lastClientMessageAt) {
          // No client message found, skip
          continue;
        }

        const minutesSinceLastMessage = Math.floor(
          (now.getTime() - lastClientMessageAt.getTime()) / (60 * 1000)
        );

        // Find which message orders have been sent (para este caso específico)
        // Normalizar para número para garantir comparação correta
        const sentOrders = new Set(caseHistory.map((h) => Number(h.message_order)));

        // Ordenar configs por message_order para calcular delay cumulativo
        const sortedConfigs = [...activeConfigs].sort((a, b) => (a.message_order ?? 0) - (b.message_order ?? 0));

        // Calcular delay cumulativo para cada config
        // Ex: config1 delay=6, config2 delay=6, config3 delay=6
        // Tempo para config1: 6min, config2: 12min, config3: 18min
        const configsWithCumulativeDelay = sortedConfigs.map((config, index) => {
          let cumulativeDelay = 0;
          for (let i = 0; i <= index; i++) {
            // Garantir que delay_minutes seja número (pode vir como string do Baserow)
            cumulativeDelay += Number(sortedConfigs[i].delay_minutes) || 60;
          }
          return { config, cumulativeDelay };
        });

        // Find the next config to send (apenas UMA por caso por execução)
        let configToSend: FollowUpConfigRow | null = null;

        for (const { config, cumulativeDelay } of configsWithCumulativeDelay) {
          // Garantir que order seja número para comparação correta
          const order = Number(config.message_order) || 0;

          // Skip if already sent for this case
          if (sentOrders.has(order)) {
            continue;
          }

          // Check if this config is within allowed time window
          if (!configsInTime.some((c) => c.id === config.id)) {
            continue;
          }

          // Check if enough time has passed (usando delay CUMULATIVO)
          // Ex: msg1 delay=6 -> enviar após 6min
          //     msg2 delay=6 -> enviar após 12min (6+6)
          //     msg3 delay=6 -> enviar após 18min (6+6+6)
          if (minutesSinceLastMessage >= cumulativeDelay) {
            // Check if previous orders have been sent (sequential)
            const previousOrdersSent = Array.from({ length: order - 1 }, (_, i) => i + 1)
              .every((prevOrder) => sentOrders.has(prevOrder) || !activeConfigs.some((c) => c.message_order === prevOrder));

            if (previousOrdersSent) {
              console.log(
                `[follow-up] Caso ${caseRow.id}: enviando mensagem ${order} (delay cumulativo: ${cumulativeDelay}min, tempo desde última msg: ${minutesSinceLastMessage}min)`
              );
              configToSend = config;
              break; // Enviar apenas UMA mensagem por caso por execução
            }
          }
        }

        if (!configToSend) {
          continue;
        }

        // Send the message
        const messageContent = configToSend.message_content ?? "";
        if (!messageContent.trim()) {
          continue;
        }

        const webhookPayload: ChatWebhookPayload = {
          display_phone_number: wabaPhone,
          to: customerPhone,
          text: messageContent,
          DataHora: formatDateTimeBR(now),
          field: "follow-up",
          messages_type: "text",
          CaseID: caseRow.BJCaseId ?? caseRow.CaseId ?? caseRow.id,
          institution_id: instId,
          waba_phone_id: wabaPhoneId,
        };

        const success = await dispatchFollowUpWebhook(webhookPayload);

        // Record in history
        try {
          await createFollowUpHistory({
            case_id: caseRow.id,
            institution_id: instId,
            config_id: configToSend.id,
            message_order: configToSend.message_order ?? 0,
            customer_phone: customerPhone,
            message_sent: messageContent,
            sent_at: now.toISOString(),
            status: success ? "success" : "failed",
            error_message: success ? undefined : "Falha no envio via webhook",
            last_client_message_at: lastClientMessageAt.toISOString(),
          });
        } catch (historyError) {
          console.error(`[follow-up] Erro ao registrar histórico:`, historyError);
        }

        results.push({
          caseId: caseRow.id,
          customerPhone,
          messageOrder: configToSend.message_order ?? 0,
          status: success ? "success" : "failed",
          reason: success ? undefined : "Falha no envio",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      processed: results.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[follow-up] Erro no processamento:", error);
    return NextResponse.json(
      {
        error: "Erro ao processar follow-ups",
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing / status check
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get("institution_id");

  try {
    const configs = institutionId
      ? await getFollowUpConfigs(Number(institutionId))
      : [];

    const activeConfigs = configs.filter((c) => isConfigActive(c.is_active));

    return NextResponse.json({
      status: "ok",
      webhook_configured: Boolean(FOLLOW_UP_WEBHOOK_URL),
      institution_id: institutionId ? Number(institutionId) : null,
      total_configs: configs.length,
      active_configs: activeConfigs.length,
      configs: activeConfigs.map((c) => ({
        id: c.id,
        order: c.message_order,
        delay_minutes: c.delay_minutes,
        allowed_days: c.allowed_days,
        allowed_time: `${c.allowed_start_time} - ${c.allowed_end_time}`,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erro ao verificar configurações",
      },
      { status: 500 }
    );
  }
}

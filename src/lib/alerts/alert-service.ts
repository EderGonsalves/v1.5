import type { BaserowCaseRow, WebhookRow } from "@/services/api";
import { getWebhooks, updateWebhook } from "@/services/api";
import { getCaseStage, isCasePaused, type CaseStage } from "@/lib/case-stats";
import type {
  AlertStage,
  CaseAlertPayload,
  SendAlertResult,
  SendAlertsResult,
} from "./types";

const isTruthyFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return !["não", "nao", "false", "0", "off", "no"].includes(normalized);
  }
  return Boolean(value);
};

const buildAlertPayload = (
  alertType: AlertStage,
  caseData: BaserowCaseRow,
): CaseAlertPayload => {
  return {
    alertType,
    triggeredAt: new Date().toISOString(),
    case: {
      id: caseData.id,
      caseId: caseData.CaseId,
      bjCaseId: caseData.BJCaseId,
      customerName: caseData.CustumerName,
      customerPhone: caseData.CustumerPhone,
      institutionId:
        caseData.InstitutionID ??
        (typeof caseData["body.auth.institutionId"] === "number"
          ? caseData["body.auth.institutionId"]
          : undefined),
      createdAt: caseData.Data ?? caseData.data ?? undefined,
      stages: {
        depoimentoInicial: isTruthyFlag(caseData.DepoimentoInicial),
        etapaPerguntas: isTruthyFlag(caseData.EtapaPerguntas),
        etapaFinal: isTruthyFlag(caseData.EtapaFinal),
      },
      summary: caseData.Resumo,
      conversation: caseData.Conversa,
      isPaused: isCasePaused(caseData),
    },
    metadata: {
      source: "onboarding-app",
      version: "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
    },
  };
};

const shouldTriggerForStage = (
  webhook: WebhookRow,
  stage: AlertStage,
): boolean => {
  if (!webhook.is_active) return false;

  switch (stage) {
    case "DepoimentoInicial":
      return isTruthyFlag(webhook.alert_depoimento_inicial);
    case "EtapaPerguntas":
      return isTruthyFlag(webhook.alert_etapa_perguntas);
    case "EtapaFinal":
      return isTruthyFlag(webhook.alert_etapa_final);
    default:
      return false;
  }
};

const sendToWebhook = async (
  webhook: WebhookRow,
  payload: CaseAlertPayload,
): Promise<SendAlertResult> => {
  const { id, webhook_url, webhook_name, webhook_secret } = webhook;

  if (!webhook_url) {
    return {
      success: false,
      webhookId: id,
      webhookName: webhook_name,
      error: "URL do webhook não configurada",
    };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (webhook_secret) {
      headers["X-Webhook-Secret"] = webhook_secret;
    }

    const response = await fetch(webhook_url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const success = response.ok;

    // Update last_triggered_at and last_status in background
    updateWebhook(id, {
      last_triggered_at: new Date().toISOString(),
      last_status: success ? "success" : "failed",
    }).catch((err) => {
      console.error(`Erro ao atualizar status do webhook ${id}:`, err);
    });

    return {
      success,
      webhookId: id,
      webhookName: webhook_name,
      statusCode: response.status,
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";

    // Update last_status as failed in background
    updateWebhook(id, {
      last_triggered_at: new Date().toISOString(),
      last_status: "failed",
    }).catch((err) => {
      console.error(`Erro ao atualizar status do webhook ${id}:`, err);
    });

    return {
      success: false,
      webhookId: id,
      webhookName: webhook_name,
      error: errorMessage,
    };
  }
};

export const sendCaseAlert = async (
  alertType: AlertStage,
  caseData: BaserowCaseRow,
  institutionId: number,
): Promise<SendAlertsResult> => {
  const triggeredAt = new Date().toISOString();
  const results: SendAlertResult[] = [];

  try {
    const webhooks = await getWebhooks(institutionId);
    const activeWebhooks = webhooks.filter((w) =>
      shouldTriggerForStage(w, alertType),
    );

    if (activeWebhooks.length === 0) {
      return {
        triggeredAt,
        alertType,
        caseId: caseData.id,
        results: [],
        totalWebhooks: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const payload = buildAlertPayload(alertType, caseData);

    // Send to all webhooks in parallel
    const sendPromises = activeWebhooks.map((webhook) =>
      sendToWebhook(webhook, payload),
    );
    const sendResults = await Promise.allSettled(sendPromises);

    for (const result of sendResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          success: false,
          webhookId: 0,
          error: result.reason?.message ?? "Erro desconhecido",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return {
      triggeredAt,
      alertType,
      caseId: caseData.id,
      results,
      totalWebhooks: activeWebhooks.length,
      successCount,
      failureCount,
    };
  } catch (error) {
    console.error("Erro ao enviar alertas:", error);
    return {
      triggeredAt,
      alertType,
      caseId: caseData.id,
      results: [
        {
          success: false,
          webhookId: 0,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao buscar webhooks",
        },
      ],
      totalWebhooks: 0,
      successCount: 0,
      failureCount: 1,
    };
  }
};

export const sendAlertForCurrentStage = async (
  caseData: BaserowCaseRow,
  institutionId: number,
): Promise<SendAlertsResult | null> => {
  const currentStage = getCaseStage(caseData);

  if (!currentStage) {
    return null;
  }

  return sendCaseAlert(currentStage, caseData, institutionId);
};

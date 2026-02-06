import type { CaseStage } from "@/lib/case-stats";

export type AlertStage = CaseStage;

export type CaseAlertPayload = {
  alertType: AlertStage;
  triggeredAt: string;
  case: {
    id: number;
    caseId?: number;
    bjCaseId?: string | number;
    customerName?: string;
    customerPhone?: string;
    institutionId?: number;
    createdAt?: string;
    stages: {
      depoimentoInicial: boolean;
      etapaPerguntas: boolean;
      etapaFinal: boolean;
    };
    summary?: string;
    conversation?: string;
    isPaused: boolean;
  };
  metadata: {
    source: string;
    version: string;
    environment: string;
  };
};

export type SendAlertResult = {
  success: boolean;
  webhookId: number;
  webhookName?: string;
  statusCode?: number;
  error?: string;
};

export type SendAlertsResult = {
  triggeredAt: string;
  alertType: AlertStage;
  caseId: number;
  results: SendAlertResult[];
  totalWebhooks: number;
  successCount: number;
  failureCount: number;
};

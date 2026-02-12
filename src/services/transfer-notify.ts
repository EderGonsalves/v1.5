import type { UserPublicRow } from "@/services/permissions";

const TRANSFER_WEBHOOK_URL =
  "https://automation-webhook.riasistemas.com.br/webhook/v2-tranferencia";

type TransferNotifyPayload = {
  type: "transfer" | "new_case";
  message: string;
  user: {
    id: number;
    name: string;
    email: string;
    phone: string;
    institutionId?: number;
  };
  case: {
    id: number;
    caseId?: number | string;
    customerName?: string;
    customerPhone?: string;
    bjCaseId?: string | number;
    institutionId?: number | string;
    responsavel?: string;
  };
  department?: { id: number; name: string };
  timestamp: string;
};

/**
 * Notifica o webhook de transferência quando um caso é atribuído a um usuário.
 * Não lança erro — falhas são logadas silenciosamente para não bloquear o fluxo.
 */
export async function notifyTransferWebhook(params: {
  type: "transfer" | "new_case";
  user: UserPublicRow;
  caseInfo: {
    id: number;
    caseId?: number | string;
    customerName?: string;
    customerPhone?: string;
    bjCaseId?: string | number;
    institutionId?: number | string;
    responsavel?: string;
  };
  department?: { id: number; name: string };
}): Promise<void> {
  const { type, user, caseInfo, department } = params;

  const message =
    type === "transfer"
      ? "Um novo caso foi transferido para você."
      : "Você recebeu um novo caso.";

  const payload: TransferNotifyPayload = {
    type,
    message,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      institutionId: user.institutionId,
    },
    case: caseInfo,
    ...(department ? { department } : {}),
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(TRANSFER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Erro ao notificar webhook de transferência:", err);
  }
}

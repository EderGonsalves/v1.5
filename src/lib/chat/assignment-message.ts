import { baserowPost } from "@/services/api";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ??
  process.env.NEXT_PUBLIC_BASEROW_API_URL ??
  "";

const BASEROW_CASE_MESSAGES_TABLE_ID =
  Number(
    process.env.BASEROW_CASE_MESSAGES_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID,
  ) || 0;

/**
 * Creates a ghost (internal) message in the case chat indicating an assignment event.
 * These messages are visible only to agents — NOT sent to the customer.
 *
 * Uses the existing ghost message infrastructure:
 * - field = "ghost" (not "chat")
 * - Sender = "sistema"
 * - Displayed with violet "Mensagem Interna" badge in the UI
 */
export async function createAssignmentGhostMessage(
  caseId: number | string,
  message: string,
): Promise<void> {
  if (!BASEROW_API_URL || !BASEROW_CASE_MESSAGES_TABLE_ID) {
    console.error("Configuração do Baserow para mensagens não encontrada.");
    return;
  }

  const now = new Date();
  const dataHora = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true`;

  try {
    await baserowPost(url, {
      CaseId: String(caseId),
      Sender: "sistema",
      Message: message,
      field: "ghost",
      DataHora: dataHora,
      messages_type: "text",
    });
  } catch (err) {
    console.error(`Erro ao criar ghost message para caso ${caseId}:`, err);
  }
}

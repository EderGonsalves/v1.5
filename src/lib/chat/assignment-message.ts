import { createCaseMessageRow } from "@/lib/chat/baserow";

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
  const now = new Date();
  const dataHora = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  try {
    await createCaseMessageRow({
      caseIdentifier: String(caseId),
      sender: "sistema",
      content: message,
      field: "ghost",
      timestamp: dataHora,
      messages_type: "text",
    });
  } catch (err) {
    console.error(`Erro ao criar ghost message para caso ${caseId}:`, err);
  }
}

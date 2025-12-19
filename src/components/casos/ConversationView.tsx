"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type MessageType = "cliente" | "agente";

interface Message {
  type: MessageType;
  content: string;
}

interface ConversationViewProps {
  conversation: string;
  className?: string;
}

export function ConversationView({ conversation, className }: ConversationViewProps) {
  const messages = useMemo(() => {
    if (!conversation || !conversation.trim()) {
      return [];
    }

    const lines = conversation.split("\n").filter((line) => line.trim());
    const parsedMessages: Message[] = [];
    let currentMessage: Message | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("Cliente:")) {
        // Finalizar mensagem anterior se existir
        if (currentMessage) {
          parsedMessages.push(currentMessage);
        }
        // Iniciar nova mensagem do cliente
        const content = trimmedLine.replace(/^Cliente:\s*/, "").trim();
        currentMessage = {
          type: "cliente",
          content: content || "",
        };
      } else if (trimmedLine.startsWith("Agente:")) {
        // Finalizar mensagem anterior se existir
        if (currentMessage) {
          parsedMessages.push(currentMessage);
        }
        // Iniciar nova mensagem do agente
        const content = trimmedLine.replace(/^Agente:\s*/, "").trim();
        currentMessage = {
          type: "agente",
          content: content || "",
        };
      } else if (currentMessage && trimmedLine) {
        // Continuar a mensagem atual (pode ter múltiplas linhas)
        currentMessage.content += (currentMessage.content ? " " : "") + trimmedLine;
      }
    }

    // Adicionar última mensagem se existir
    if (currentMessage) {
      parsedMessages.push(currentMessage);
    }

    return parsedMessages;
  }, [conversation]);

  if (messages.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <p className="text-muted-foreground text-center">
          Nenhuma conversa registrada.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {messages.map((message, index) => (
        <div
          key={index}
          className={cn(
            "flex w-full",
            message.type === "cliente" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className={cn(
              "max-w-[80%] rounded-lg px-4 py-2.5 shadow-sm",
              message.type === "cliente"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground border border-border",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-xs font-semibold uppercase",
                  message.type === "cliente"
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {message.type === "cliente" ? "Cliente" : "Agente"}
              </span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}


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

const prefixPatterns: Array<{ pattern: RegExp; type: MessageType }> = [
  { pattern: /^Cliente\s*:/i, type: "cliente" },
  { pattern: /^Mensagem\s+User\s*:/i, type: "cliente" },
  { pattern: /^Agente\s*:/i, type: "agente" },
  { pattern: /^Mensagem\s+Bot\s*:/i, type: "agente" },
];

export function ConversationView({ conversation, className }: ConversationViewProps) {
  const messages = useMemo(() => {
    if (!conversation || !conversation.trim()) {
      return [];
    }

    const lines = conversation
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const parsedMessages: Message[] = [];
    let currentMessage: Message | null = null;

    for (const line of lines) {
      if (/^(null|undefined)$/i.test(line)) {
        continue;
      }

      const matchedPrefix = prefixPatterns.find(({ pattern }) => pattern.test(line));

      if (matchedPrefix) {
        if (currentMessage) {
          parsedMessages.push(currentMessage);
        }

        const content = line.replace(matchedPrefix.pattern, "").trim();
        currentMessage = {
          type: matchedPrefix.type,
          content: content || "",
        };
        continue;
      }

      if (currentMessage) {
        // Continue current speaker message even if it spans multiple lines
        currentMessage.content += (currentMessage.content ? " " : "") + line;
      }
    }

    // Finalize last message if needed
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

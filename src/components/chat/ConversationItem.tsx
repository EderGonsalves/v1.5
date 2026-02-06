"use client";

import { User, PauseCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/hooks/use-conversations";

type ConversationItemProps = {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
};

const formatRelativeTime = (date: Date | string | null | undefined): string => {
  if (!date) return "";

  // Convert string to Date if needed (from JSON cache)
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `${diffDays}d`;

  return dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export const ConversationItem = ({
  conversation,
  isSelected,
  onClick,
}: ConversationItemProps) => {
  const timeLabel = formatRelativeTime(conversation.lastMessageAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
        "hover:bg-muted/50 border-b border-border/40",
        isSelected && "bg-muted"
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        {conversation.paused && (
          <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 p-0.5">
            <PauseCircle className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground truncate">
            {conversation.customerName}
          </span>
          {timeLabel && (
            <span className="text-xs text-muted-foreground shrink-0">
              {timeLabel}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {conversation.customerPhone}
        </p>
      </div>
    </button>
  );
};

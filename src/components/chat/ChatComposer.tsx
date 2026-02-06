"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ghost, Loader2, Mic, Paperclip, Send, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { cn } from "@/lib/utils";
import type { SendCaseMessagePayload } from "@/lib/chat/types";

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  type: "image" | "audio" | "file";
};

type ChatComposerProps = {
  onSend: (payload: SendCaseMessagePayload) => Promise<unknown>;
  isSending: boolean;
  disabled?: boolean;
  isWindowClosed?: boolean;
  /** Número WABA para enviar a mensagem (quando há múltiplos números) */
  wabaPhoneNumber?: string | null;
};

const MAX_ATTACHMENTS = 5;

const formatSize = (size: number) => {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const detectAttachmentType = (file: File): PendingAttachment["type"] => {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "file";
};

const createAttachment = (file: File): PendingAttachment => {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const previewUrl = URL.createObjectURL(file);
  return {
    id,
    file,
    previewUrl,
    type: detectAttachmentType(file),
  };
};

export const ChatComposer = ({
  onSend,
  isSending,
  disabled,
  isWindowClosed,
  wabaPhoneNumber,
}: ChatComposerProps) => {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const {
    isSupported: canRecordAudio,
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setAttachments((prev) => {
      const remainingSlots = MAX_ATTACHMENTS - prev.length;
      if (remainingSlots <= 0) {
        return prev;
      }
      const newAttachments = files.slice(0, remainingSlots).map(createAttachment);
      return [...prev, ...newAttachments];
    });
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    addFiles(files);
    event.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const hasContent = useMemo(() => {
    return Boolean(message.trim()) || attachments.length > 0;
  }, [attachments.length, message]);

  const handleSend = async () => {
    if (!hasContent || disabled || isSending) {
      return;
    }
    const payload: SendCaseMessagePayload = {
      content: message.trim(),
      attachments: attachments.map((entry) => entry.file),
      ...(isGhostMode && { type: "ghost" }),
      ...(wabaPhoneNumber && { wabaPhoneNumber }),
    };
    try {
      await onSend(payload);
      setMessage("");
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setAttachments([]);
      // Ghost mode permanece ativo até o usuário desativar manualmente
    } catch (error) {
      console.error("Falha ao enviar mensagem do chat:", error);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleRecordToggle = async () => {
    if (!canRecordAudio || disabled || isSending) return;
    if (isRecording) {
      const recordedFile = await stopRecording();
      if (recordedFile) {
        addFiles([recordedFile]);
      }
    } else {
      await startRecording();
    }
  };

  const clearAllAttachments = () => {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setAttachments([]);
    if (isRecording) {
      cancelRecording();
    }
  };

  return (
    <div className="space-y-2">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="rounded-lg border bg-card p-2 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Anexos ({attachments.length}/{MAX_ATTACHMENTS})</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-destructive hover:underline"
              onClick={clearAllAttachments}
              disabled={isSending || disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative flex items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1.5"
              >
                {attachment.type === "image" ? (
                  <div className="relative h-10 w-10 overflow-hidden rounded">
                    <Image
                      src={attachment.previewUrl ?? ""}
                      alt={attachment.file.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : attachment.type === "audio" ? (
                  <audio
                    controls
                    src={attachment.previewUrl}
                    className="h-8 max-w-[140px]"
                  >
                    Seu navegador não suporta áudio embutido.
                  </audio>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                    <Paperclip className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 max-w-[120px]">
                  <p className="truncate text-xs font-medium">
                    {attachment.file.name || "arquivo"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(attachment.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label="Remover anexo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Window Closed Warning */}
      {isWindowClosed && (
        <p className="text-xs text-amber-600 px-1">
          Janela 24h expirada. A mensagem será armazenada e enviada quando reaberta.
        </p>
      )}

      {/* Ghost Mode Indicator */}
      {isGhostMode && (
        <div className="flex items-center gap-2 px-1">
          <Ghost className="h-4 w-4 text-violet-500" />
          <p className="text-xs text-violet-600">
            Modo Ghost ativo - mensagem não será exibida para o cliente
          </p>
        </div>
      )}

      {/* Composer - WhatsApp structure */}
      <div className="flex items-end gap-2">
        {/* Input Area */}
        <div className="flex-1 flex items-center gap-1 rounded-full border bg-card px-2 py-1">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
            onChange={handleFileChange}
            disabled={disabled || isSending}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSending || attachments.length >= MAX_ATTACHMENTS}
            title="Anexar arquivo"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0 transition-colors",
              isGhostMode
                ? "text-violet-500 bg-violet-500/10 hover:bg-violet-500/20 hover:text-violet-600"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setIsGhostMode(!isGhostMode)}
            disabled={disabled || isSending}
            title={isGhostMode ? "Modo Ghost ativo - mensagem não será exibida para o cliente" : "Ativar modo Ghost"}
          >
            <Ghost className="h-5 w-5" />
          </Button>

          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Digite uma mensagem"
            rows={1}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none border-none bg-transparent text-sm focus-visible:ring-0 py-2 px-1"
            disabled={disabled || isSending}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Action Button - Mic or Send */}
        {hasContent ? (
          <Button
            type="button"
            onClick={handleSend}
            disabled={disabled || isSending}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant={isRecording ? "destructive" : "default"}
            size="icon"
            className={cn("h-10 w-10 shrink-0 rounded-full", isRecording && "animate-pulse")}
            onClick={handleRecordToggle}
            disabled={!canRecordAudio || disabled || isSending}
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center justify-center gap-2 text-destructive">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-medium">Gravando...</span>
        </div>
      )}
    </div>
  );
};

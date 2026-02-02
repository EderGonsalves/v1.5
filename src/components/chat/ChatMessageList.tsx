"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Download, FileText, ImageIcon, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CaseMessage, CaseMessageAttachment } from "@/lib/chat/types";

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const dayLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ImageModalProps = {
  attachment: CaseMessageAttachment | null;
  onClose: () => void;
};

// Função utilitária para forçar download de arquivo
const forceDownload = async (url: string, filename: string) => {
  try {
    // Fazer fetch do arquivo e criar blob para download
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });

    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      // Criar link invisível e clicar para iniciar download
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      link.style.cssText = "position:absolute;left:-9999px;";
      document.body.appendChild(link);
      link.click();

      // Limpar após um pequeno delay
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
      return;
    }
  } catch {
    // Fetch falhou (provavelmente CORS), usar método alternativo
  }

  // Fallback: criar link com atributo download
  // Nota: o download pode não funcionar para domínios diferentes devido a restrições do navegador
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.cssText = "position:absolute;left:-9999px;";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 100);
};

const ImageModal = ({ attachment, onClose }: ImageModalProps) => {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleDownload = useCallback(async () => {
    if (!attachment?.url) return;
    await forceDownload(attachment.url, attachment.name || "imagem");
  }, [attachment]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (attachment) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [attachment, onClose]);

  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={handleBackdropClick}
    >
      {/* Header com botões */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button
          variant="secondary"
          size="icon"
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={handleDownload}
          title="Baixar imagem"
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={onClose}
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Imagem */}
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <Image
          src={attachment.url}
          alt={attachment.name}
          width={1200}
          height={800}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
          unoptimized
        />
        {/* Nome do arquivo */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg">
          <p className="text-white text-sm truncate">{attachment.name}</p>
        </div>
      </div>
    </div>
  );
};

type ImageAttachmentProps = {
  attachment: CaseMessageAttachment;
  onImageClick: (attachment: CaseMessageAttachment) => void;
};

const ImageAttachment = ({ attachment, onImageClick }: ImageAttachmentProps) => {
  const src = attachment.previewUrl ?? attachment.url;

  return (
    <div className="overflow-hidden rounded-lg cursor-pointer group relative">
      <button
        type="button"
        onClick={() => onImageClick(attachment)}
        className="block w-full"
      >
        <Image
          src={src}
          alt={attachment.name}
          width={300}
          height={200}
          className="max-h-48 w-full object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 300px"
          unoptimized
        />
        {/* Overlay ao hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
            Clique para ampliar
          </span>
        </div>
      </button>
    </div>
  );
};

type DocumentAttachmentProps = {
  attachment: CaseMessageAttachment;
  isClient: boolean;
};

const DocumentAttachment = ({ attachment, isClient }: DocumentAttachmentProps) => {
  const handleDownload = useCallback(async () => {
    if (!attachment?.url) return;
    await forceDownload(attachment.url, attachment.name || "documento");
  }, [attachment]);

  const fileSize = formatFileSize(attachment.size);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm w-full transition-colors",
        isClient
          ? "bg-muted/50 hover:bg-muted"
          : "bg-white/10 hover:bg-white/20"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        isClient ? "bg-primary/10 text-primary" : "bg-white/20 text-white"
      )}>
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className={cn(
          "truncate font-medium text-[13px]",
          isClient ? "text-foreground" : "text-white"
        )}>
          {attachment.name}
        </p>
        <p className={cn(
          "text-[11px]",
          isClient ? "text-muted-foreground" : "text-white/70"
        )}>
          {fileSize ? `${fileSize} • ` : ""}Clique para baixar
        </p>
      </div>
      <Download className={cn(
        "h-4 w-4 shrink-0",
        isClient ? "text-muted-foreground" : "text-white/70"
      )} />
    </button>
  );
};

type AttachmentGridProps = {
  attachments: CaseMessageAttachment[];
  isClient: boolean;
  onImageClick: (attachment: CaseMessageAttachment) => void;
};

const AttachmentGrid = ({ attachments, isClient, onImageClick }: AttachmentGridProps) => {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {attachments.map((attachment) => {
        if (!attachment?.url) {
          return null;
        }

        // Imagens - clicáveis para abrir modal
        if (attachment.isImage || attachment.mimeType.startsWith("image/")) {
          return (
            <ImageAttachment
              key={attachment.id}
              attachment={attachment}
              onImageClick={onImageClick}
            />
          );
        }

        // Áudios
        if (attachment.mimeType.startsWith("audio/")) {
          return (
            <div key={attachment.id} className="py-1">
              <audio controls src={attachment.url} className="h-10 max-w-[240px]">
                Seu navegador não suporta áudio embutido.
              </audio>
            </div>
          );
        }

        // Documentos e outros arquivos - apenas download
        return (
          <DocumentAttachment
            key={attachment.id}
            attachment={attachment}
            isClient={isClient}
          />
        );
      })}
    </div>
  );
};

type ChatMessageListProps = {
  messages: CaseMessage[];
  isLoading: boolean;
  className?: string;
};

export const ChatMessageList = ({
  messages,
  isLoading,
  className,
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<CaseMessageAttachment | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages]);

  const handleImageClick = useCallback((attachment: CaseMessageAttachment) => {
    setSelectedImage(attachment);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const items = useMemo(() => {
    if (!messages.length) {
      return [];
    }

    const result: Array<
      | { type: "date"; label: string; key: string }
      | { type: "message"; value: CaseMessage; key: string }
    > = [];

    let lastDateKey: string | null = null;

    messages.forEach((message) => {
      const date = new Date(message.createdAt);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        result.push({
          type: "date",
          key: `date-${dateKey}`,
          label: dayLabelFormatter.format(date),
        });
      }

      result.push({
        type: "message",
        key: `msg-${message.id}`,
        value: message,
      });
    });

    return result;
  }, [messages]);

  if (isLoading) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando conversa...</p>
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center text-center", className)}>
        <div className="rounded-full bg-primary/10 p-4">
          <ImageIcon className="h-8 w-8 text-primary" />
        </div>
        <p className="mt-3 text-base font-medium text-foreground">
          Nenhuma conversa ainda
        </p>
        <p className="text-sm text-muted-foreground">
          As mensagens aparecerão aqui quando o cliente enviar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn("flex h-full flex-col gap-1 overflow-y-auto px-4 py-2 md:px-12 lg:px-16", className)}
      >
        {items.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.key} className="flex justify-center py-2">
                <span className="rounded-lg bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm capitalize">
                  {item.label}
                </span>
              </div>
            );
          }

          const message = item.value;
          const isClient = message.sender === "cliente";
          const isBot = message.sender === "bot" || message.sender === "sistema";
          const isAgent = message.sender === "agente";

          // Label for sender
          const senderLabel = isClient
            ? "Cliente"
            : isBot
              ? "Bot"
              : isAgent
                ? "Agente"
                : "Sistema";

          return (
            <div
              key={item.key}
              className={cn("flex w-full mb-0.5", isClient ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
                  isClient
                    ? "bg-card text-card-foreground"
                    : "bg-primary text-primary-foreground chat-bubble-agent",
                )}
              >
                {/* Sender label */}
                <div className={cn(
                  "text-[10px] font-semibold mb-0.5",
                  isClient ? "text-muted-foreground" : "text-white/80"
                )}>
                  {senderLabel}
                </div>

                <AttachmentGrid
                  attachments={message.attachments}
                  isClient={isClient}
                  onImageClick={handleImageClick}
                />

                {message.content ? (
                  <p
                    className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words pr-14"
                    style={{ color: isClient ? undefined : '#ffffff' }}
                  >
                    {message.content}
                  </p>
                ) : null}

                {/* Timestamp and status */}
                <div className={cn(
                  "flex items-center justify-end gap-1 mt-0.5",
                  message.content ? "-mt-4 float-right ml-2 relative top-1" : ""
                )}>
                  <span className={cn(
                    "text-[11px]",
                    isClient ? "text-muted-foreground" : "text-white/70"
                  )}>
                    {formatTime(message.createdAt)}
                  </span>
                  {!isClient && (
                    <CheckCheck className="h-4 w-4 text-white/70" />
                  )}
                </div>
                <div className="clear-both" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de imagem */}
      <ImageModal attachment={selectedImage} onClose={handleCloseModal} />
    </>
  );
};

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, RefreshCw, Search, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/hooks/use-conversations";
import { ConversationItem } from "./ConversationItem";

type ConversationListProps = {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (conversation: Conversation) => void;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore?: boolean;
  hasMoreFromServer?: boolean;
  onLoadMore?: () => void;
  onRefresh: () => void;
  onNewConversation?: () => void;
  className?: string;
};

const INITIAL_VISIBLE = 30;
const LOAD_MORE_COUNT = 30;

export const ConversationList = ({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  isRefreshing,
  isLoadingMore = false,
  hasMoreFromServer = false,
  onLoadMore,
  onRefresh,
  onNewConversation,
  className,
}: ConversationListProps) => {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;

    const searchLower = search.toLowerCase().trim();
    return conversations.filter((conv) => {
      const nameMatch = conv.customerName.toLowerCase().includes(searchLower);
      const phoneMatch = conv.customerPhone.toLowerCase().includes(searchLower);
      return nameMatch || phoneMatch;
    });
  }, [conversations, search]);

  // Conversas visíveis na tela (paginação virtual)
  const visibleConversations = useMemo(() => {
    return filteredConversations.slice(0, visibleCount);
  }, [filteredConversations, visibleCount]);

  // Verifica se há mais para exibir (virtual) ou buscar (servidor)
  const hasMoreToShow = filteredConversations.length > visibleCount;
  const showSentinel = hasMoreToShow || hasMoreFromServer;

  // Função para carregar mais (virtual)
  const showMore = useCallback(() => {
    setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
  }, []);

  // Infinite scroll com IntersectionObserver (virtual + server)
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          if (hasMoreToShow) {
            showMore();
          } else if (hasMoreFromServer && !isLoadingMore && onLoadMore) {
            onLoadMore();
          }
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMoreToShow, hasMoreFromServer, isLoadingMore, showMore, onLoadMore]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setVisibleCount(INITIAL_VISIBLE);
  }, []);

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold text-foreground">Conversas</h2>
        <div className="flex items-center gap-1 text-[#1B263B] dark:text-[#D4E0EB]">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-full hover:bg-[#D4E0EB] dark:hover:bg-[#263850] transition-colors"
            title="Atualizar lista"
          >
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </button>
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="p-2 rounded-full hover:bg-[#D4E0EB] dark:hover:bg-[#263850] transition-colors"
              title="Nova conversa"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">
              {search ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
            </p>
          </div>
        ) : (
          <>
            {visibleConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onClick={() => onSelect(conversation)}
              />
            ))}
            {/* Sentinela para infinite scroll (virtual + server) */}
            {showSentinel && (
              <div ref={loadMoreRef} className="py-3 text-center">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Carregando mais...</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 border-t text-xs text-muted-foreground">
        {visibleConversations.length}
        {(hasMoreToShow || hasMoreFromServer) && "+"} conversa{filteredConversations.length !== 1 ? "s" : ""}
        {search && conversations.length !== filteredConversations.length && (
          <span> (de {conversations.length} total)</span>
        )}
      </div>
    </div>
  );
};

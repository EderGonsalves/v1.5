"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";

import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useConversations, type Conversation } from "@/hooks/use-conversations";
import { useWabaNumbers } from "@/hooks/use-waba-numbers";
import { useCaseWabaMap } from "@/hooks/use-case-waba-map";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatPanel } from "@/components/chat/ChatPanel";

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isHydrated } = useOnboarding();
  const institutionId = data.auth?.institutionId ?? undefined;

  const {
    conversations,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useConversations(institutionId);

  const { numbers: wabaNumbers } = useWabaNumbers(institutionId);

  // Hook para mapa de case -> waba number
  const { getWabaForCase } = useCaseWabaMap(institutionId);

  const selectedCaseId = searchParams.get("case");
  const selectedId = selectedCaseId ? Number(selectedCaseId) : null;

  // Enriquecer conversas com o número WABA do mapa
  const enrichedConversations = useMemo(() => {
    return conversations.map((conv) => {
      // Se já tem número WABA, mantém
      if (conv.wabaPhoneNumber) return conv;

      // Tenta pegar do mapa
      const wabaFromMap = getWabaForCase(conv.caseId, conv.id);
      if (wabaFromMap) {
        return { ...conv, wabaPhoneNumber: wabaFromMap };
      }

      return conv;
    });
  }, [conversations, getWabaForCase]);

  // Filtrar conversas pelo número WABA selecionado
  const filteredConversations = enrichedConversations;

  const selectedConversation = useMemo(() => {
    if (!selectedId) return null;
    return enrichedConversations.find((c) => c.id === selectedId) ?? null;
  }, [enrichedConversations, selectedId]);

  // Determinar qual numero WABA usar para enviar mensagens
  const activeWabaNumber = useMemo(() => {
    if (selectedConversation?.wabaPhoneNumber) {
      return selectedConversation.wabaPhoneNumber;
    }
    if (wabaNumbers.length > 0) {
      return wabaNumbers[0].phoneNumber.replace(/\D/g, "");
    }
    return null;
  }, [selectedConversation, wabaNumbers]);

  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("case", String(conversation.id));
      router.push(`/chat?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleBack = useCallback(() => {
    router.push("/chat");
  }, [router]);

  // Redirect to login if not authenticated (only after hydration)
  useEffect(() => {
    if (isHydrated && !data.auth) {
      router.push("/");
    }
  }, [data.auth, isHydrated, router]);

  // Wait for hydration before rendering
  if (!isHydrated) {
    return null;
  }

  if (!data.auth) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* Lista de conversas - desktop sempre visível, mobile condicional */}
      <aside
        className={`
          w-full lg:w-[350px] lg:min-w-[300px] lg:max-w-[400px]
          border-r border-border/40
          ${selectedId ? "hidden lg:flex" : "flex"}
          flex-col
        `}
      >
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedId}
          onSelect={handleSelectConversation}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          className="h-full"
        />
      </aside>

      {/* Área do chat */}
      <main className={`flex-1 flex flex-col ${selectedId ? "flex" : "hidden lg:flex"}`}>
        {selectedConversation ? (
          <ChatPanel
            key={selectedConversation.id}
            caseRowId={selectedConversation.id}
            conversation={selectedConversation}
            onBack={handleBack}
            activeWabaNumber={activeWabaNumber}
            wabaNumbers={wabaNumbers}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/30">
            <div className="rounded-full bg-muted p-6 mb-4">
              <MessageCircle className="h-12 w-12 opacity-50" />
            </div>
            <h2 className="text-xl font-medium mb-2">Chat Onboarding</h2>
            <p className="text-sm text-center max-w-md">
              Selecione uma conversa na lista ao lado para iniciar o atendimento
            </p>
          </div>
        )}
      </main>

      {/* Error Banner */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Carregando...</span>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatContent />
    </Suspense>
  );
}

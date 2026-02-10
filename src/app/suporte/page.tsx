"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useSupport } from "@/hooks/use-support";
import {
  searchKBClient,
  fetchTicketMessagesClient,
  createTicketMessageClient,
} from "@/services/support-client";
import type {
  SupportTicketRow,
  SupportKBRow,
  SupportMessageRow,
} from "@/services/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Send,
  ArrowLeft,
  CircleHelp,
  BookOpen,
  Plus,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSADMIN_INSTITUTION_ID = 4;

const CATEGORIES = [
  { value: "sistema", label: "Informações sobre o sistema" },
  { value: "ia", label: "Personalização da IA" },
  { value: "financeiro", label: "Financeiro" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  em_andamento:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  concluido:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const SECTORS = [
  "Suporte Técnico",
  "Personalização IA",
  "Financeiro",
  "Comercial",
];

type View = "kb" | "form" | "list" | "detail";

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SuportePage() {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId;
  const isSysAdmin = institutionId === SYSADMIN_INSTITUTION_ID;

  const {
    tickets,
    isLoading,
    isRefreshing,
    error,
    refresh,
    createTicket,
    updateTicket,
  } = useSupport();

  const [view, setView] = useState<View>("kb");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRow | null>(
    null,
  );

  // KB Search state
  const [kbQuery, setKbQuery] = useState("");
  const [kbResults, setKbResults] = useState<SupportKBRow[]>([]);
  const [kbSearched, setKbSearched] = useState(false);
  const [kbLoading, setKbLoading] = useState(false);

  // New ticket form state
  const [formCategory, setFormCategory] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Ticket detail state
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filters (list view)
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // KB search handler
  const handleKBSearch = useCallback(async () => {
    if (!kbQuery.trim()) return;
    setKbLoading(true);
    try {
      const articles = await searchKBClient(kbQuery);
      setKbResults(articles);
      setKbSearched(true);
    } catch {
      setKbResults([]);
      setKbSearched(true);
    } finally {
      setKbLoading(false);
    }
  }, [kbQuery]);

  // Create ticket handler
  const handleCreateTicket = useCallback(async () => {
    if (!formCategory || !formSubject.trim() || !formDescription.trim()) return;
    setFormSubmitting(true);
    try {
      await createTicket({
        category: formCategory,
        subject: formSubject.trim(),
        description: formDescription.trim(),
      });
      setFormCategory("");
      setFormSubject("");
      setFormDescription("");
      setView("list");
    } catch (err) {
      console.error("Erro ao criar chamado:", err);
    } finally {
      setFormSubmitting(false);
    }
  }, [formCategory, formSubject, formDescription, createTicket]);

  // Open ticket detail
  const openTicketDetail = useCallback(
    async (ticket: SupportTicketRow) => {
      setSelectedTicket(ticket);
      setView("detail");
      setMessagesLoading(true);
      try {
        const msgs = await fetchTicketMessagesClient(ticket.id);
        setMessages(msgs);
      } catch {
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    setSendingMessage(true);
    try {
      const msg = await createTicketMessageClient(selectedTicket.id, {
        content: newMessage.trim(),
      });
      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    } finally {
      setSendingMessage(false);
    }
  }, [newMessage, selectedTicket]);

  // sysAdmin update ticket
  const handleUpdateTicket = useCallback(
    async (field: string, value: string) => {
      if (!selectedTicket) return;
      try {
        const updated = await updateTicket(selectedTicket.id, {
          [field]: value,
        });
        setSelectedTicket(updated);
      } catch (err) {
        console.error("Erro ao atualizar chamado:", err);
      }
    },
    [selectedTicket, updateTicket],
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    return true;
  });

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-background py-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#7E99B5] dark:border-border/60">
          <div className="flex items-center gap-2">
            {view !== "kb" && (
              <button
                onClick={() => {
                  if (view === "detail") setView("list");
                  else if (view === "form") setView("kb");
                  else setView("kb");
                }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CircleHelp className="h-4 w-4" />
              Suporte
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {(view === "kb" || view === "list") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView(view === "list" ? "kb" : "list")}
              >
                {view === "list" ? (
                  <>
                    <BookOpen className="h-4 w-4 mr-1.5" />
                    Base de Conhecimento
                  </>
                ) : (
                  <>
                    <CircleHelp className="h-4 w-4 mr-1.5" />
                    {isSysAdmin ? "Todos os Chamados" : "Meus Chamados"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* KB Search View */}
        {view === "kb" && (
          <div className="space-y-4">
            <div className="border-b border-[#7E99B5] dark:border-border/60 px-4 py-4 space-y-4">
              <h3 className="text-sm font-medium text-foreground">
                Como podemos ajudar?
              </h3>
              <p className="text-xs text-muted-foreground">
                Pesquise na base de conhecimento antes de abrir um chamado.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Digite sua dúvida..."
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleKBSearch();
                  }}
                />
                <Button onClick={handleKBSearch} disabled={kbLoading} size="sm">
                  {kbLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* KB Results */}
            {kbSearched && (
              <div className="space-y-1">
                {kbResults.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground px-4">
                      {kbResults.length} resultado(s) encontrado(s)
                    </p>
                    {kbResults.map((article) => (
                      <div
                        key={article.id}
                        className="border-b border-[#7E99B5] dark:border-border/60 px-4 py-3 space-y-1"
                      >
                        <h3 className="text-sm font-medium text-foreground">
                          {article.title}
                        </h3>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {article.content}
                        </p>
                        {article.category && (
                          <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {article.category}
                          </span>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum resultado encontrado para &quot;{kbQuery}&quot;.
                  </p>
                )}

                {/* Button to open ticket */}
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Não encontrou o que procurava?
                  </p>
                  <Button
                    onClick={() => setView("form")}
                    variant="default"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Abrir chamado
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* New Ticket Form View */}
        {view === "form" && (
          <div className="px-4 py-4 space-y-4">
            <h3 className="text-sm font-medium text-foreground">
              Novo Chamado
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Categoria
                </label>
                <div className="relative">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none pr-8"
                  >
                    <option value="">Selecione a categoria</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Assunto
                </label>
                <Input
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Resuma sua solicitação"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Descrição
                </label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descreva em detalhes sua dúvida ou solicitação..."
                  rows={5}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleCreateTicket}
                  disabled={
                    formSubmitting ||
                    !formCategory ||
                    !formSubject.trim() ||
                    !formDescription.trim()
                  }
                  size="sm"
                >
                  {formSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1.5" />
                  )}
                  Enviar chamado
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Ticket List View */}
        {view === "list" && (
          <div className="space-y-1">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none pr-7"
                >
                  <option value="">Todos os status</option>
                  <option value="aberto">Aberto</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none pr-7"
                >
                  <option value="">Todas as categorias</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <div className="ml-auto">
                <button
                  onClick={refresh}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 text-muted-foreground",
                      isRefreshing && "animate-spin",
                    )}
                  />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive text-center py-8">
                {error}
              </p>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <CircleHelp className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  Nenhum chamado encontrado.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView("kb")}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Abrir chamado
                </Button>
              </div>
            ) : (
              filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => openTicketDetail(ticket)}
                  className="w-full text-left border-b border-[#7E99B5] dark:border-border/60 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {ticket.protocol}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] px-1.5 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[ticket.status] ?? "bg-muted",
                          )}
                        >
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">
                        {ticket.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {CATEGORIES.find(
                            (c) => c.value === ticket.category,
                          )?.label ?? ticket.category}
                        </span>
                        {isSysAdmin && ticket.created_by_name && (
                          <>
                            <span className="text-[11px] text-muted-foreground">
                              &middot;
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {ticket.created_by_name}
                            </span>
                          </>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          &middot;
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(ticket.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Ticket Detail View */}
        {view === "detail" && selectedTicket && (
          <div className="space-y-4">
            {/* Ticket header */}
            <div className="border-b border-[#7E99B5] dark:border-border/60 px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {selectedTicket.protocol}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] px-1.5 py-0.5 rounded-full font-medium",
                        STATUS_COLORS[selectedTicket.status] ?? "bg-muted",
                      )}
                    >
                      {STATUS_LABELS[selectedTicket.status] ??
                        selectedTicket.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedTicket.subject}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {selectedTicket.created_by_name} &middot;{" "}
                    {formatDate(selectedTicket.created_at)}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>
              </div>

              {/* sysAdmin controls */}
              {isSysAdmin && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        value={selectedTicket.status}
                        onChange={(e) =>
                          handleUpdateTicket("status", e.target.value)
                        }
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none pr-7"
                      >
                        <option value="aberto">Aberto</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluido">Concluído</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Setor
                    </label>
                    <div className="relative">
                      <select
                        value={selectedTicket.sector}
                        onChange={(e) =>
                          handleUpdateTicket("sector", e.target.value)
                        }
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none pr-7"
                      >
                        {SECTORS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Responsável
                    </label>
                    <Input
                      value={selectedTicket.assigned_to}
                      onChange={(e) =>
                        handleUpdateTicket("assigned_to", e.target.value)
                      }
                      className="h-8 text-xs w-full"
                      placeholder="Responsável"
                    />
                  </div>
                </div>
              )}

              {/* Info for non-sysAdmin */}
              {!isSysAdmin && (
                <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  <span>
                    Setor: <strong>{selectedTicket.sector || "—"}</strong>
                  </span>
                  {selectedTicket.assigned_to && (
                    <span>
                      Responsável:{" "}
                      <strong>{selectedTicket.assigned_to}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex flex-col" style={{ minHeight: "300px", maxHeight: "500px" }}>
              <div className="px-4 py-2 border-b border-[#7E99B5] dark:border-border/60">
                <h3 className="text-xs font-semibold text-foreground">
                  Conversa
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (() => {
                  // Build conversation: ticket description as first message + API messages (deduplicated)
                  const descContent = selectedTicket.description?.trim();
                  const firstApiMsg = messages[0];
                  const skipFirst =
                    descContent &&
                    firstApiMsg &&
                    firstApiMsg.author_role === "user" &&
                    firstApiMsg.content.trim() === descContent;
                  const apiMessages = skipFirst ? messages.slice(1) : messages;

                  return (
                    <>
                      {/* Ticket description as first message */}
                      {descContent && (
                        <div className="flex flex-col max-w-[85%] items-start">
                          <div className="rounded-lg px-3 py-2 text-xs bg-[#D4E0EB] dark:bg-[#1B263B]">
                            <p className="whitespace-pre-wrap text-[#1B263B] dark:text-[#D4E0EB]">{descContent}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                            {selectedTicket.created_by_name}
                            {selectedTicket.created_at &&
                              ` · ${formatDate(selectedTicket.created_at)}`}
                          </span>
                        </div>
                      )}
                      {/* Remaining messages */}
                      {apiMessages.map((msg) => {
                        const isSupport = msg.author_role === "support";
                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex flex-col max-w-[85%]",
                              isSupport ? "ml-auto items-end" : "items-start",
                            )}
                          >
                            <div
                              className={cn(
                                "rounded-lg px-3 py-2 text-xs",
                                isSupport
                                  ? "bg-[#263850] dark:bg-[#7E99B5]"
                                  : "bg-[#D4E0EB] dark:bg-[#1B263B]",
                              )}
                            >
                              <p className={cn(
                                "whitespace-pre-wrap",
                                isSupport
                                  ? "text-white dark:text-[#0D1B2A]"
                                  : "text-[#1B263B] dark:text-[#D4E0EB]",
                              )}>{msg.content}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                              {msg.author_name}
                              {msg.created_at && ` · ${formatDate(msg.created_at)}`}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              {selectedTicket.status !== "concluido" && (
                <div className="px-4 py-3 border-t border-[#7E99B5] dark:border-border/60">
                  <div className="flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Escrever mensagem..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendingMessage || !newMessage.trim()}
                      size="icon"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {selectedTicket.status === "concluido" && (
                <div className="px-4 py-3 border-t border-[#7E99B5] dark:border-border/60 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    Este chamado foi concluído.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

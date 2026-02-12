"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConversationView } from "@/components/casos/ConversationView";
import {
  ExternalLink,
  MessageSquareText,
  Save,
  Loader2,
  User,
  MapPin,
  Briefcase,
  FileText,
  UserCircle,
  CheckCircle,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import type { BaserowCaseRow, ClientRow } from "@/services/api";
import { updateClient, createClient, updateBaserowCase, searchClientByPhone } from "@/services/api";
import { getCaseStage, stageLabels, stageColors } from "@/lib/case-stats";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useUsers } from "@/hooks/use-users";
import { useDepartments } from "@/hooks/use-departments";
import { fetchDepartmentUsersClient } from "@/services/departments-client";
import { notifyTransferWebhook } from "@/services/transfer-notify";
import type { UserPublicRow } from "@/services/permissions";

type KanbanCardDetailProps = {
  caseData: BaserowCaseRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaseUpdate?: (caseId: number, updates: Partial<BaserowCaseRow>) => void;
};

const ESTADO_CIVIL_OPTIONS = [
  "Solteiro(a)",
  "Casado(a)",
  "Separado(a)",
  "União Estável",
  "Divorciado(a)",
];

const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export function KanbanCardDetail({
  caseData,
  open,
  onOpenChange,
  onCaseUpdate,
}: KanbanCardDetailProps) {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId;
  const { users: institutionUsers } = useUsers(institutionId);
  const { departments } = useDepartments(institutionId);

  const [clientData, setClientData] = useState<ClientRow | null>(null);
  const [isLoadingClient, setIsLoadingClient] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [responsavel, setResponsavel] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [deptUsers, setDeptUsers] = useState<UserPublicRow[] | null>(null);
  const [valorInput, setValorInput] = useState("");
  const [updatingResultado, setUpdatingResultado] = useState(false);
  const [formData, setFormData] = useState<Partial<ClientRow>>({});

  // Load department users when department changes
  useEffect(() => {
    if (!selectedDeptId) {
      setDeptUsers(null);
      return;
    }
    let active = true;
    fetchDepartmentUsersClient(selectedDeptId)
      .then((users) => {
        if (active) setDeptUsers(users);
      })
      .catch(() => {
        if (active) setDeptUsers(null);
      });
    return () => { active = false; };
  }, [selectedDeptId]);

  // The list of users shown in the Responsável dropdown
  const availableUsers = useMemo(() => {
    if (selectedDeptId && deptUsers) return deptUsers.filter((u) => u.isActive);
    return institutionUsers.filter((u) => u.isActive);
  }, [selectedDeptId, deptUsers, institutionUsers]);

  useEffect(() => {
    if (open && caseData) {
      setResponsavel(caseData.responsavel || "");
      setSelectedDeptId(
        typeof caseData.department_id === "number" ? caseData.department_id : null,
      );
      const currentValor = typeof caseData.valor === "number"
        ? caseData.valor
        : typeof caseData.valor === "string"
          ? parseFloat(caseData.valor as string)
          : 0;
      setValorInput(isNaN(currentValor) ? "0" : currentValor.toString());
      setUpdatingResultado(false);
      setSaveSuccess(false);

      // Always search client by phone number (unique identifier)
      const phone = caseData.CustumerPhone || "";
      const institutionId = caseData.InstitutionID ||
        (typeof caseData["body.auth.institutionId"] === "number"
          ? caseData["body.auth.institutionId"]
          : Number(caseData["body.auth.institutionId"]) || 0);

      if (phone && institutionId) {
        loadClientByPhone(phone, institutionId);
      } else {
        setClientData(null);
        setFormData({
          nome_completo: caseData.CustumerName || "",
          celular: phone,
        });
      }
    }
  }, [open, caseData]);

  const loadClientByPhone = async (phone: string, institutionId: number) => {
    setIsLoadingClient(true);
    try {
      const client = await searchClientByPhone(phone, institutionId);
      if (client) {
        setClientData(client);
        setFormData({
          nome_completo: client.nome_completo || caseData?.CustumerName || "",
          cpf: client.cpf || "",
          rg: client.rg || "",
          celular: client.celular || phone,
          email: client.email || "",
          estado_civil: typeof client.estado_civil === "object" ? client.estado_civil?.value : client.estado_civil || "",
          profissao: client.profissao || "",
          data_nascimento: client.data_nascimento || "",
          nacionalidade: client.nacionalidade || "",
          endereco_rua: client.endereco_rua || "",
          endereco_numero: client.endereco_numero || "",
          endereco_complemento: client.endereco_complemento || "",
          endereco_bairro: client.endereco_bairro || "",
          endereco_estado: client.endereco_estado || "",
          endereco_cidade: client.endereco_cidade || "",
        });
      } else {
        // No client found - initialize with case data
        setClientData(null);
        setFormData({
          nome_completo: caseData?.CustumerName || "",
          celular: phone,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar dados do cliente:", error);
      setClientData(null);
      setFormData({
        nome_completo: caseData?.CustumerName || "",
        celular: phone,
      });
    } finally {
      setIsLoadingClient(false);
    }
  };

  const handleInputChange = (field: keyof ClientRow, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!caseData) return;

    setIsSaving(true);
    try {
      const institutionId = caseData.InstitutionID ||
        (typeof caseData["body.auth.institutionId"] === "number"
          ? caseData["body.auth.institutionId"]
          : Number(caseData["body.auth.institutionId"]) || 0);

      // Get phone number - this is the unique identifier for clients
      const phone = caseData.CustumerPhone || formData.celular || "";

      // Save case information (responsavel + valor + department)
      const newValor = parseCurrencyInput(valorInput);
      const previousResponsavel = caseData.responsavel || "";
      const selectedDept = departments.find((d) => d.id === selectedDeptId);
      const targetUser = institutionUsers.find((u) => u.name === responsavel);
      const caseUpdates: Record<string, unknown> = {
        responsavel,
        valor: newValor,
        department_id: selectedDeptId ?? null,
        department_name: selectedDept?.name ?? null,
        assigned_to_user_id: targetUser?.id ?? null,
      };
      await updateBaserowCase(caseData.id, caseUpdates);
      onCaseUpdate?.(caseData.id, {
        responsavel,
        valor: newValor,
        department_id: selectedDeptId,
        department_name: selectedDept?.name ?? null,
        assigned_to_user_id: targetUser?.id ?? null,
      });

      // Notify webhook if responsavel changed
      if (responsavel && responsavel !== previousResponsavel) {
        if (targetUser) {
          notifyTransferWebhook({
            type: previousResponsavel ? "transfer" : "new_case",
            user: targetUser,
            caseInfo: {
              id: caseData.id,
              caseId: caseData.CaseId,
              customerName: caseData.CustumerName,
              customerPhone: caseData.CustumerPhone,
              bjCaseId: caseData.BJCaseId,
              institutionId: institutionId,
              responsavel,
            },
            department: selectedDept
              ? { id: selectedDept.id, name: selectedDept.name }
              : undefined,
          });
        }
      }

      // Handle client data - always use phone as the unique key
      if (phone && institutionId) {
        // Search for existing client by phone number
        const existingClient = await searchClientByPhone(phone, institutionId);

        if (existingClient) {
          // Update existing client found by phone
          await updateClient(existingClient.id, {
            ...formData,
            celular: phone, // Ensure phone is always set
          });
          setClientData(existingClient);
        } else {
          // Create new client with the phone number
          const newClient = await createClient({
            ...formData,
            celular: phone,
            nome_completo: formData.nome_completo || caseData.CustumerName || "",
            institution_id: institutionId,
          });
          setClientData(newClient);
        }
      }

      // Show success feedback
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!caseData) return null;

  const stage = getCaseStage(caseData);
  const isPaused = (caseData.IApause || "").toLowerCase() === "sim";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-hidden flex flex-col p-0"
        style={{ maxWidth: "1200px", width: "95vw" }}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-xl font-bold">
              {caseData.CustumerName || "Cliente sem nome"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {caseData.BJCaseId && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://app.riasistemas.com.br/case/edit/${caseData.BJCaseId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Editar no BJ
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/chat?case=${caseData.id}`}>
                  <MessageSquareText className="h-4 w-4 mr-1.5" />
                  Abrir Chat
                </Link>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="caso" className="h-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="caso" className="gap-2">
                <Briefcase className="h-4 w-4" />
                Caso
              </TabsTrigger>
              <TabsTrigger value="cliente" className="gap-2">
                <UserCircle className="h-4 w-4" />
                Dados do Cliente
              </TabsTrigger>
              <TabsTrigger value="conversa" className="gap-2">
                <MessageSquareText className="h-4 w-4" />
                Conversa
              </TabsTrigger>
              <TabsTrigger value="resumo" className="gap-2">
                <FileText className="h-4 w-4" />
                Resumo
              </TabsTrigger>
            </TabsList>

            {/* Aba Caso */}
            <TabsContent value="caso" className="mt-0">
              <div className="rounded-lg border bg-card p-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Departamento
                    </Label>
                    <select
                      value={selectedDeptId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedDeptId(val ? Number(val) : null);
                        // Reset responsável when department changes
                        setResponsavel("");
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Todos (sem filtro)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Responsável
                    </Label>
                    <select
                      value={responsavel}
                      onChange={(e) => setResponsavel(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Selecione o responsável</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Status do Atendimento
                    </Label>
                    <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium flex items-center gap-2">
                      {stage && (
                        <span className={cn("px-2 py-0.5 text-xs font-semibold rounded-full", stageColors[stage])}>
                          {stageLabels[stage]}
                        </span>
                      )}
                      {isPaused && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                          IA Pausada
                        </span>
                      )}
                      {!stage && !isPaused && "Não definido"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Telefone do Cliente
                    </Label>
                    <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                      {caseData.CustumerPhone || "—"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Data
                    </Label>
                    <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                      {caseData.Data || "—"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      ID do Caso
                    </Label>
                    <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm font-mono">
                      {caseData.CaseId || caseData.id}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      BJ Case ID
                    </Label>
                    <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm font-mono">
                      {caseData.BJCaseId || "—"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Valor da Causa
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={valorInput}
                        onChange={(e) => setValorInput(e.target.value)}
                        placeholder="0,00"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatCurrency(parseCurrencyInput(valorInput))}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Resultado
                    </Label>
                    <div className="h-9 flex items-center gap-2">
                      {(() => {
                        const resultado = (caseData.resultado || "").toLowerCase();
                        if (resultado === "ganho") {
                          return (
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                              Ganho
                            </span>
                          );
                        }
                        if (resultado === "perdido") {
                          return (
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">
                              Perdido
                            </span>
                          );
                        }
                        return (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                              onClick={async () => {
                                setUpdatingResultado(true);
                                try {
                                  await updateBaserowCase(caseData.id, { resultado: "ganho" });
                                  onCaseUpdate?.(caseData.id, { resultado: "ganho" });
                                } catch (err) {
                                  console.error("Erro ao atualizar resultado:", err);
                                } finally {
                                  setUpdatingResultado(false);
                                }
                              }}
                              disabled={updatingResultado}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Ganho
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              onClick={async () => {
                                setUpdatingResultado(true);
                                try {
                                  await updateBaserowCase(caseData.id, { resultado: "perdido" });
                                  onCaseUpdate?.(caseData.id, { resultado: "perdido" });
                                } catch (err) {
                                  console.error("Erro ao atualizar resultado:", err);
                                } finally {
                                  setUpdatingResultado(false);
                                }
                              }}
                              disabled={updatingResultado}
                            >
                              <X className="h-3.5 w-3.5" />
                              Perdido
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-6">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    size="lg"
                    variant={saveSuccess ? "outline" : "default"}
                    className={saveSuccess ? "bg-green-50 border-green-500 text-green-700" : ""}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : saveSuccess ? (
                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {saveSuccess ? "Salvo!" : "Salvar"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Aba Dados do Cliente */}
            <TabsContent value="cliente" className="mt-0 space-y-6">
              {isLoadingClient ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Dados Pessoais */}
                  <div className="rounded-lg border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <User className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-base">Dados Pessoais</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Nome Completo
                        </Label>
                        <Input
                          value={formData.nome_completo || ""}
                          onChange={(e) => handleInputChange("nome_completo", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          CPF
                        </Label>
                        <Input
                          value={formData.cpf || ""}
                          onChange={(e) => handleInputChange("cpf", e.target.value)}
                          placeholder="000.000.000-00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          RG
                        </Label>
                        <Input
                          value={formData.rg || ""}
                          onChange={(e) => handleInputChange("rg", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Celular
                        </Label>
                        <Input
                          value={formData.celular || ""}
                          onChange={(e) => handleInputChange("celular", e.target.value)}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          E-mail
                        </Label>
                        <Input
                          type="email"
                          value={formData.email || ""}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Data de Nascimento
                        </Label>
                        <Input
                          type="date"
                          value={formData.data_nascimento || ""}
                          onChange={(e) => handleInputChange("data_nascimento", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Estado Civil
                        </Label>
                        <select
                          value={formData.estado_civil as string || ""}
                          onChange={(e) => handleInputChange("estado_civil", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Selecione</option>
                          {ESTADO_CIVIL_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Profissão
                        </Label>
                        <Input
                          value={formData.profissao || ""}
                          onChange={(e) => handleInputChange("profissao", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Nacionalidade
                        </Label>
                        <Input
                          value={formData.nacionalidade || ""}
                          onChange={(e) => handleInputChange("nacionalidade", e.target.value)}
                          placeholder="Brasileira"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="rounded-lg border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-base">Endereço</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Rua / Logradouro
                        </Label>
                        <Input
                          value={formData.endereco_rua || ""}
                          onChange={(e) => handleInputChange("endereco_rua", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Número
                        </Label>
                        <Input
                          value={formData.endereco_numero || ""}
                          onChange={(e) => handleInputChange("endereco_numero", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Complemento
                        </Label>
                        <Input
                          value={formData.endereco_complemento || ""}
                          onChange={(e) => handleInputChange("endereco_complemento", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Bairro
                        </Label>
                        <Input
                          value={formData.endereco_bairro || ""}
                          onChange={(e) => handleInputChange("endereco_bairro", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Cidade
                        </Label>
                        <Input
                          value={formData.endereco_cidade || ""}
                          onChange={(e) => handleInputChange("endereco_cidade", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Estado
                        </Label>
                        <select
                          value={formData.endereco_estado || ""}
                          onChange={(e) => handleInputChange("endereco_estado", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">UF</option>
                          {ESTADOS_BR.map((uf) => (
                            <option key={uf} value={uf}>{uf}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-2 pb-2">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      size="lg"
                      variant={saveSuccess ? "outline" : "default"}
                      className={saveSuccess ? "bg-green-50 border-green-500 text-green-700" : ""}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : saveSuccess ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {saveSuccess ? "Salvo!" : "Salvar Alterações"}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Aba Conversa */}
            <TabsContent value="conversa" className="mt-0">
              <div className="rounded-lg border p-4 min-h-[400px] max-h-[500px] overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
                <ConversationView conversation={caseData.Conversa || ""} />
              </div>
            </TabsContent>

            {/* Aba Resumo */}
            <TabsContent value="resumo" className="mt-0">
              <div className="rounded-lg border p-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                {caseData.Resumo ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                    {caseData.Resumo}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Nenhum resumo registrado.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

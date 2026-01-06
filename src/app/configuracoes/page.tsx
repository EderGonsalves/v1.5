"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getBaserowConfigs, updateBaserowConfig, updateConfig, type BaserowConfigRow } from "@/services/api";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import type { OnboardingPayload } from "@/lib/validations";
import { onboardingPayloadSchema } from "@/lib/validations";
import { LoadingScreen } from "@/components/ui/loading-screen";

type EditableField = {
  key: string;
  value: unknown;
  isEditing: boolean;
};

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { data } = useOnboarding();
  const [configs, setConfigs] = useState<BaserowConfigRow[]>([]);
  const [editingFields, setEditingFields] = useState<Record<number, Record<string, EditableField>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingToWebhook, setIsSendingToWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data.auth) {
      router.push("/");
      return;
    }

    loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.auth]);

  const loadConfigs = async () => {
    if (!data.auth) return;

    try {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      console.log("Carregando configurações do Baserow para institutionId:", data.auth.institutionId);
      const results = await getBaserowConfigs(data.auth.institutionId);
      console.log("Configurações encontradas:", results);
      setConfigs(results);
      
      // Inicializar campos editáveis
      const initialEditing: Record<number, Record<string, EditableField>> = {};
      results.forEach((config) => {
        initialEditing[config.id] = {};
        Object.entries(config).forEach(([key, value]) => {
          if (key !== "id") {
            initialEditing[config.id][key] = {
              key,
              value,
              isEditing: false,
            };
          }
        });
      });
      setEditingFields(initialEditing);
    } catch (err) {
      console.error("Erro ao carregar configurações:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar configurações",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (rowId: number, fieldKey: string) => {
    setEditingFields((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [fieldKey]: {
          ...prev[rowId][fieldKey],
          isEditing: true,
        },
      },
    }));
  };

  const cancelEditing = (rowId: number, fieldKey: string) => {
    setEditingFields((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [fieldKey]: {
          ...prev[rowId][fieldKey],
          isEditing: false,
          value: configs.find((c) => c.id === rowId)?.[fieldKey],
        },
      },
    }));
  };

  const updateFieldValue = (rowId: number, fieldKey: string, newValue: unknown) => {
    setEditingFields((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [fieldKey]: {
          ...prev[rowId][fieldKey],
          value: newValue,
        },
      },
    }));
  };

  const saveField = async (rowId: number, fieldKey: string) => {
    const field = editingFields[rowId]?.[fieldKey];
    if (!field) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedData: Partial<BaserowConfigRow> = {
        [fieldKey]: field.value,
      };

      console.log(`Salvando campo ${fieldKey} da linha ${rowId}:`, updatedData);
      
      const updated = await updateBaserowConfig(rowId, updatedData);
      
      // Atualizar a configuração na lista
      setConfigs((prev) =>
        prev.map((config) => (config.id === rowId ? updated : config))
      );

      // Atualizar o campo editável
      setEditingFields((prev) => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [fieldKey]: {
            ...prev[rowId][fieldKey],
            isEditing: false,
            value: updated[fieldKey],
          },
        },
      }));

      setSuccessMessage(`Campo ${formatFieldName(fieldKey)} salvo com sucesso!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Erro ao salvar campo:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar campo",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Mapeamento dos campos do Baserow para os nomes usados no onboarding
  const fieldNameMap: Record<string, string> = {
    // Informações da empresa
    "body.tenant.companyName": "Nome do escritório",
    "body.tenant.businessHours": "Horários de atendimento",
    "body.tenant.phoneNumber": "Número de telefone conectado à API",
    
    // Endereço
    "body.tenant.address.street": "Rua",
    "body.tenant.address.city": "Cidade",
    "body.tenant.address.state": "Estado",
    "body.tenant.address.zipCode": "CEP",
    
    // Perfil do agente
    "body.agentSettings.profile.agentName": "Nome do agente orquestrador",
    "body.agentSettings.profile.language": "Idioma principal",
    "body.agentSettings.profile.personalityDescription": "Descrição da personalidade",
    "body.agentSettings.profile.expertiseArea": "Área de expertise",
    
    // Personalidade do agente
    "body.agentSettings.personality.greeting": "Saudação inicial",
    "body.agentSettings.personality.closing": "Frase de despedida",
    "body.agentSettings.personality.forbiddenWords.0": "Palavras proibidas",
    
    // Etapas do agente
    "body.agentSettings.stages.0.stage": "Etapa 1 - Nome",
    "body.agentSettings.stages.0.agent": "Etapa 1 - Agente",
    "body.agentSettings.stages.0.mission": "Etapa 1 - Missão",
    "body.agentSettings.stages.0.script": "Etapa 1 - Script",
    "body.agentSettings.stages.1.stage": "Etapa 2 - Nome",
    "body.agentSettings.stages.1.agent": "Etapa 2 - Agente",
    "body.agentSettings.stages.1.mission": "Etapa 2 - Missão",
    "body.agentSettings.stages.1.script": "Etapa 2 - Script",
    "body.agentSettings.stages.2.stage": "Etapa 3 - Nome",
    "body.agentSettings.stages.2.agent": "Etapa 3 - Agente",
    "body.agentSettings.stages.2.mission": "Etapa 3 - Missão",
    "body.agentSettings.stages.2.script": "Etapa 3 - Script",
    "body.agentSettings.stages.3.stage": "Etapa 4 - Nome",
    "body.agentSettings.stages.3.agent": "Etapa 4 - Agente",
    "body.agentSettings.stages.3.mission": "Etapa 4 - Missão",
    "body.agentSettings.stages.3.script": "Etapa 4 - Script",
    
    // Fluxo do agente
    "body.agentSettings.flow.greetingsScript": "Mensagem de recepção",
    "body.agentSettings.flow.companyOfferings": "Produtos e nichos atendidos",
    "body.agentSettings.flow.qualificationPrompt": "Pergunta de qualificação",
    "body.agentSettings.flow.qualificationFallback": "Resposta quando o lead não quer seguir",
    "body.agentSettings.flow.viabilityQuestions.0.prompt": "Pergunta de viabilidade 1",
    "body.agentSettings.flow.viabilityQuestions.0.objective": "Objetivo da pergunta 1",
    "body.agentSettings.flow.viabilityQuestions.1.prompt": "Pergunta de viabilidade 2",
    "body.agentSettings.flow.viabilityQuestions.1.objective": "Objetivo da pergunta 2",
    "body.agentSettings.flow.disqualificationRules": "Regras de desqualificação",
    "body.agentSettings.flow.commitmentType": "Tipo de compromisso",
    "body.agentSettings.flow.commitmentScript": "Mensagem para assinatura/agendamento",
    "body.agentSettings.flow.documentsChecklist.0": "Documento 1",
    "body.agentSettings.flow.documentsChecklist.1": "Documento 2",
    "body.agentSettings.flow.documentsChecklist.2": "Documento 3",
    "body.agentSettings.flow.documentConfirmationMessage": "Mensagem de confirmação de documentos",
    "body.agentSettings.flow.closingMessage": "Mensagem de encerramento",
    "body.agentSettings.flow.followUpRules": "Regras de follow-up",
    
    // Auth
    "body.auth.institutionId": "ID da Instituição",
  };

  const formatFieldName = (fieldName: string): string => {
    // Verificar se existe mapeamento direto
    if (fieldNameMap[fieldName]) {
      return fieldNameMap[fieldName];
    }
    
    // Se não houver mapeamento, formatar automaticamente
    return fieldName
      .replace(/body\./g, "")
      .replace(/tenant\./g, "Empresa → ")
      .replace(/agentSettings\./g, "Agente → ")
      .replace(/profile\./g, "Perfil → ")
      .replace(/personality\./g, "Personalidade → ")
      .replace(/stages\./g, "Etapas → ")
      .replace(/flow\./g, "Fluxo → ")
      .replace(/address\./g, "Endereço → ")
      .replace(/auth\./g, "Autenticação → ")
      .replace(/\./g, " → ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const parseValue = (value: string, originalValue: unknown): unknown => {
    if (value.trim() === "") {
      return null;
    }
    
    // Se o valor original era um objeto, tentar fazer parse
    if (typeof originalValue === "object" && originalValue !== null) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    
    // Se o valor original era número, tentar converter
    if (typeof originalValue === "number") {
      const num = Number(value);
      return Number.isNaN(num) ? value : num;
    }
    
    // Se o valor original era boolean
    if (typeof originalValue === "boolean") {
      return value.toLowerCase() === "true";
    }
    
    return value;
  };

  const transformBaserowToPayload = (config: BaserowConfigRow): OnboardingPayload => {
    const row = config as Record<string, unknown>;
    
    // Função auxiliar para converter valor para número
    const asNumber = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return null;
    };
    
    // Extrair institutionId - pode vir como string ou número do Baserow
    const institutionIdValue = row["body.auth.institutionId"];
    console.log("institutionIdValue encontrado:", institutionIdValue, "tipo:", typeof institutionIdValue);
    
    // Tentar usar o institutionId do contexto se não estiver na linha
    let institutionId: number;
    if (institutionIdValue) {
      const parsedId = asNumber(institutionIdValue);
      if (parsedId !== null) {
        institutionId = parsedId;
      } else if (data.auth?.institutionId) {
        console.warn("institutionId da linha inválido, usando do contexto:", data.auth.institutionId);
        institutionId = data.auth.institutionId;
      } else {
        throw new Error(`institutionId não encontrado ou inválido. Valor recebido: ${institutionIdValue} (tipo: ${typeof institutionIdValue})`);
      }
    } else if (data.auth?.institutionId) {
      console.log("institutionId não encontrado na linha, usando do contexto:", data.auth.institutionId);
      institutionId = data.auth.institutionId;
    } else {
      throw new Error("institutionId não encontrado na configuração nem no contexto de autenticação");
    }
    
    console.log("institutionId final usado:", institutionId);

    // Função auxiliar para garantir string com tamanho mínimo
    const ensureMinLength = (value: unknown, min: number, defaultValue: string): string => {
      const str = String(value || defaultValue);
      return str.length >= min ? str : defaultValue.length >= min ? defaultValue : defaultValue.padEnd(min, " ");
    };

    // Extrair tenant (companyName min 2, businessHours min 2, phoneNumber min 10)
    const companyName = ensureMinLength(row["body.tenant.companyName"], 2, "Empresa");
    const businessHours = ensureMinLength(row["body.tenant.businessHours"], 2, "Segunda a Sexta, 9h às 18h");
    const phoneNumber = ensureMinLength(row["body.tenant.phoneNumber"], 10, "+5511999999999");
    const addressStreet = ensureMinLength(row["body.tenant.address.street"], 2, "Rua");
    const addressCity = ensureMinLength(row["body.tenant.address.city"], 2, "Cidade");
    const addressState = ensureMinLength(row["body.tenant.address.state"], 2, "Estado");
    const addressZipCode = ensureMinLength(row["body.tenant.address.zipCode"], 5, "00000-000");

    // Extrair agent profile (agentName min 2, personalityDescription min 10, expertiseArea min 5)
    const agentName = ensureMinLength(row["body.agentSettings.profile.agentName"], 2, "Agente");
    const languageValue = (row["body.agentSettings.profile.language"] as string) || "Português (Brasil)";
    const validLanguages = ["Português (Brasil)", "Inglês (EUA)", "Espanhol (Latam)"] as const;
    const language = validLanguages.includes(languageValue as typeof validLanguages[number])
      ? (languageValue as typeof validLanguages[number])
      : "Português (Brasil)";
    const personalityDescription = ensureMinLength(row["body.agentSettings.profile.personalityDescription"], 10, "Agente profissional e atencioso");
    const expertiseArea = ensureMinLength(row["body.agentSettings.profile.expertiseArea"], 5, "Direito");

    // Extrair personality (greeting min 2, closing min 2, forbiddenWords min 1 item)
    const greeting = ensureMinLength(row["body.agentSettings.personality.greeting"], 2, "Olá");
    const closing = ensureMinLength(row["body.agentSettings.personality.closing"], 2, "Até logo");
    const forbiddenWordsStr = row["body.agentSettings.personality.forbiddenWords.0"] as string || "";
    const forbiddenWords = forbiddenWordsStr
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);
    
    // Garantir que forbiddenWords tenha pelo menos 1 item
    const finalForbiddenWords = forbiddenWords.length > 0 ? forbiddenWords : ["palavra"];

    // Extrair stages (0, 1, 2, 3) - cada stage precisa: agent min 2, mission min 10, script min 10
    const stageNames = ["Saudação", "Depoimento", "Perguntas", "Fechamento"] as const;
    const stages = [];
    for (let i = 0; i < 4; i++) {
      const stageValue = row[`body.agentSettings.stages.${i}.stage`] as string;
      const agentValue = row[`body.agentSettings.stages.${i}.agent`] as string;
      const missionValue = row[`body.agentSettings.stages.${i}.mission`] as string;
      const scriptValue = row[`body.agentSettings.stages.${i}.script`] as string;
      
      const stage = stageValue && stageNames.includes(stageValue as typeof stageNames[number])
        ? (stageValue as typeof stageNames[number])
        : stageNames[i];
      
      const agent = ensureMinLength(agentValue, 2, `Agente ${i + 1}`);
      const mission = ensureMinLength(missionValue, 10, `Missão da etapa ${i + 1}: realizar a tarefa necessária`);
      const script = ensureMinLength(scriptValue, 10, `Script da etapa ${i + 1}: seguir o protocolo estabelecido`);
      
      stages.push({
        stage,
        agent,
        mission,
        script,
      });
    }

    // Extrair flow (greetingsScript min 10, companyOfferings min 5, qualificationPrompt min 5, etc.)
    const greetingsScript = ensureMinLength(row["body.agentSettings.flow.greetingsScript"], 10, "Olá! Seja bem-vindo ao nosso atendimento.");
    const companyOfferings = ensureMinLength(row["body.agentSettings.flow.companyOfferings"], 5, "Serviços diversos");
    const qualificationPrompt = ensureMinLength(row["body.agentSettings.flow.qualificationPrompt"], 5, "Você gostaria de continuar?");
    const qualificationFallback = ensureMinLength(row["body.agentSettings.flow.qualificationFallback"], 5, "Sem problemas, pode retornar quando quiser.");
    const disqualificationRules = ensureMinLength(row["body.agentSettings.flow.disqualificationRules"], 5, "Regras de desqualificação padrão");
    const commitmentTypeValue = row["body.agentSettings.flow.commitmentType"] as string;
    const commitmentType = (commitmentTypeValue === "contrato" || commitmentTypeValue === "agendamento")
      ? commitmentTypeValue as "contrato" | "agendamento"
      : "contrato";
    const commitmentScript = ensureMinLength(row["body.agentSettings.flow.commitmentScript"], 10, "Vou encaminhar o próximo passo para você.");
    const documentConfirmationMessage = ensureMinLength(row["body.agentSettings.flow.documentConfirmationMessage"], 5, "Documento recebido e confirmado.");
    const closingMessage = ensureMinLength(row["body.agentSettings.flow.closingMessage"], 5, "Obrigado pelo contato!");
    const followUpRules = ensureMinLength(row["body.agentSettings.flow.followUpRules"], 5, "Manter contato regular.");

    // Extrair viability questions (0, 1) - prompt min 5, objective min 5
    const viabilityQuestions = [];
    for (let i = 0; i < 2; i++) {
      const promptValue = row[`body.agentSettings.flow.viabilityQuestions.${i}.prompt`] as string;
      const objectiveValue = row[`body.agentSettings.flow.viabilityQuestions.${i}.objective`] as string;
      
      const prompt = ensureMinLength(promptValue, 5, `Pergunta de viabilidade ${i + 1}`);
      const objective = ensureMinLength(objectiveValue, 5, `Objetivo da pergunta ${i + 1}`);
      
      viabilityQuestions.push({ prompt, objective });
    }

    // Extrair documents checklist (0, 1, 2) - cada documento min 3 caracteres
    const documentsChecklist = [];
    for (let i = 0; i < 3; i++) {
      const docValue = row[`body.agentSettings.flow.documentsChecklist.${i}`] as string;
      if (docValue && docValue.trim().length >= 3) {
        documentsChecklist.push(docValue.trim());
      }
    }
    
    // Garantir que documentsChecklist tenha pelo menos 1 item com min 3 caracteres
    const finalDocumentsChecklist = documentsChecklist.length > 0 
      ? documentsChecklist 
      : ["Documento de identificação"];

    return {
      auth: {
        institutionId,
      },
      tenant: {
        companyName,
        businessHours,
        phoneNumber,
        address: {
          street: addressStreet,
          city: addressCity,
          state: addressState,
          zipCode: addressZipCode,
        },
      },
      agentSettings: {
        profile: {
          agentName,
          language: language as "Português (Brasil)" | "Inglês (EUA)" | "Espanhol (Latam)",
          personalityDescription,
          expertiseArea,
        },
        personality: {
          greeting,
          closing,
          forbiddenWords: finalForbiddenWords,
        },
        stages,
        flow: {
          greetingsScript,
          companyOfferings,
          qualificationPrompt,
          qualificationFallback,
          viabilityQuestions,
          disqualificationRules,
          commitmentType,
          commitmentScript,
          documentsChecklist: finalDocumentsChecklist,
          documentConfirmationMessage,
          closingMessage,
          followUpRules,
          skippableStages: [],
        },
      },
      ragFiles: [],
      // includedSteps é opcional, mas pode ser útil incluir se estiver disponível
      // Por enquanto deixamos undefined para usar os valores padrão do sistema
    };
  };

  const handleSendToWebhook = async () => {
    if (!data.auth?.institutionId) {
      setError("ID da instituição não encontrado");
      return;
    }

    try {
      setIsSendingToWebhook(true);
      setError(null);
      setSuccessMessage(null);

      console.log("Atualizando tabela antes de enviar ao webhook...");
      // Recarregar configurações do Baserow diretamente
      const updatedConfigs = await getBaserowConfigs(data.auth.institutionId);
      console.log("Configurações atualizadas:", updatedConfigs);

      if (updatedConfigs.length === 0) {
        throw new Error("Nenhuma configuração encontrada após atualização");
      }

      // Atualizar o estado com as novas configurações
      setConfigs(updatedConfigs);

      // Usar a primeira configuração (ou a mais recente)
      const configToSend = updatedConfigs[0];
      console.log("Transformando configuração do Baserow em payload...", configToSend);
      
      const payload = transformBaserowToPayload(configToSend);
      console.log("Payload transformado:", JSON.stringify(payload, null, 2));

      // Validar o payload antes de enviar
      console.log("Validando payload com schema...");
      const validation = onboardingPayloadSchema.safeParse(payload);
      
      if (!validation.success) {
        console.error("Erro de validação do payload:", validation.error.flatten());
        const errorDetails = validation.error.flatten();
        const errorMessages = Object.entries(errorDetails.fieldErrors)
          .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
          .join("\n");
        throw new Error(`Payload inválido:\n${errorMessages}\n\nDetalhes completos: ${JSON.stringify(errorDetails, null, 2)}`);
      }

      console.log("Payload validado com sucesso. Enviando para o webhook...");
      console.log("InstitutionId:", data.auth.institutionId);
      console.log("Payload final:", JSON.stringify(validation.data, null, 2));
      
      try {
        await updateConfig(data.auth.institutionId, validation.data);
      } catch (apiError) {
        console.error("Erro capturado do updateConfig:", apiError);
        throw apiError;
      }
      
      setSuccessMessage("Configurações atualizadas e enviadas ao webhook com sucesso!");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Erro ao enviar para o webhook:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao enviar configurações ao webhook",
      );
    } finally {
      setIsSendingToWebhook(false);
    }
  };

  const renderFieldValue = (rowId: number, fieldKey: string, value: unknown) => {
    const field = editingFields[rowId]?.[fieldKey];
    const isEditing = field?.isEditing ?? false;
    const displayValue = field?.value ?? value;

    if (isEditing) {
      const isObject = typeof displayValue === "object" && displayValue !== null;
      const stringValue = formatValue(displayValue);

      return (
        <div className="space-y-2">
          {isObject ? (
            <Textarea
              value={stringValue}
              onChange={(e) => {
                const parsed = parseValue(e.target.value, displayValue);
                updateFieldValue(rowId, fieldKey, parsed);
              }}
              className="font-mono text-xs min-h-[200px]"
              rows={10}
            />
          ) : (
            <Input
              type={typeof displayValue === "number" ? "number" : "text"}
              value={stringValue}
              onChange={(e) => {
                const parsed = parseValue(e.target.value, displayValue);
                updateFieldValue(rowId, fieldKey, parsed);
              }}
              className="font-mono text-xs"
            />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => saveField(rowId, fieldKey)}
              disabled={isSaving}
            >
              Salvar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => cancelEditing(rowId, fieldKey)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between group">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words flex-1">
          {formatValue(displayValue)}
        </pre>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => startEditing(rowId, fieldKey)}
        >
          Editar
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando configurações..." />;
  }

  return (
    <main className="min-h-screen bg-white py-8 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <section className="space-y-3 text-center sm:text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                Configurações Aplicadas
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                Todas as suas configurações
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-300">
                Visualize e edite todas as configurações que você aplicou no sistema.
              </p>
            </div>
            <Button 
              onClick={handleSendToWebhook} 
              disabled={isLoading || isSendingToWebhook || configs.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
            >
              {isSendingToWebhook ? "Enviando..." : "Atualizar e Enviar ao Webhook"}
            </Button>
          </div>
        </section>

        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Erro</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadConfigs}>Tentar novamente</Button>
            </CardContent>
          </Card>
        )}

        {successMessage && (
          <Card className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-900 dark:text-emerald-100">{successMessage}</p>
            </CardContent>
          </Card>
        )}

        {configs.length === 0 && !error && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                Nenhuma configuração encontrada para esta instituição (ID: {data.auth?.institutionId}).
              </p>
            </CardContent>
          </Card>
        )}

        {configs.map((config, index) => {
          // Agrupar campos por seção
          const sections: Record<string, Array<[string, unknown]>> = {
            "Informações da Empresa": [],
            "Endereço": [],
            "Perfil do Agente": [],
            "Personalidade do Agente": [],
            "Etapas do Agente": [],
            "Fluxo de Atendimento": [],
            "Outros": [],
          };

          Object.entries(config)
            .filter(([key]) => key !== "id" && key !== "order")
            .forEach(([key, value]) => {
              if (key.startsWith("body.tenant.companyName") || key.startsWith("body.tenant.businessHours") || key.startsWith("body.tenant.phoneNumber")) {
                sections["Informações da Empresa"].push([key, value]);
              } else if (key.startsWith("body.tenant.address.")) {
                sections["Endereço"].push([key, value]);
              } else if (key.startsWith("body.agentSettings.profile.")) {
                sections["Perfil do Agente"].push([key, value]);
              } else if (key.startsWith("body.agentSettings.personality.")) {
                sections["Personalidade do Agente"].push([key, value]);
              } else if (key.startsWith("body.agentSettings.stages.")) {
                sections["Etapas do Agente"].push([key, value]);
              } else if (key.startsWith("body.agentSettings.flow.")) {
                sections["Fluxo de Atendimento"].push([key, value]);
              } else {
                sections["Outros"].push([key, value]);
              }
            });

          return (
            <Card key={config.id || index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Configuração #{config.id || index + 1}</CardTitle>
                    <CardDescription>
                      ID: {config.id} | Instituição: {data.auth?.institutionId}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadConfigs}
                  >
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {Object.entries(sections)
                    .filter(([, fields]) => fields.length > 0)
                    .map(([sectionName, fields], sectionIndex) => (
                      <AccordionItem
                        key={sectionName}
                        value={`section-${config.id}-${sectionIndex}`}
                        className="border-b border-border/50"
                      >
                        <AccordionTrigger className="text-left font-semibold hover:no-underline">
                          {sectionName}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-2">
                            {fields.map(([key, value]) => (
                              <div key={key} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm font-semibold text-foreground">
                                    {formatFieldName(key)}
                                  </Label>
                                </div>
                                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                                  {renderFieldValue(config.id, key, value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardContent className="flex items-center justify-center gap-4 py-6">
            <Button variant="outline" onClick={loadConfigs} disabled={isLoading || isSendingToWebhook}>
              Recarregar
            </Button>
            <Button 
              onClick={handleSendToWebhook} 
              disabled={isLoading || isSendingToWebhook || configs.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSendingToWebhook ? "Enviando..." : "Atualizar e Enviar ao Webhook"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

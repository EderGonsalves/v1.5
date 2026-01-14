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
import {
  onboardingPayloadSchema,
  type AgentFlow,
  type OnboardingPayload,
} from "@/lib/validations";
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
    "body.tenant.wabaPhoneNumber": "Numero do WhatsApp conectado a Meta",
    "body.waba_phone_number": "Numero do WhatsApp conectado a Meta",
    
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
    "body.agentSettings.flow.briefingScope": "Escopo do briefing",
    "body.agentSettings.flow.maxQuestions": "Limite maximo de perguntas",
    "body.agentSettings.flow.directedQuestions.0.prompt": "Pergunta direcionada 1",
    "body.agentSettings.flow.directedQuestions.0.objective": "Objetivo da pergunta direcionada 1",
    "body.agentSettings.flow.directedQuestions.1.prompt": "Pergunta direcionada 2",
    "body.agentSettings.flow.directedQuestions.1.objective": "Objetivo da pergunta direcionada 2",
    "body.agentSettings.flow.directedQuestions.2.prompt": "Pergunta direcionada 3",
    "body.agentSettings.flow.directedQuestions.2.objective": "Objetivo da pergunta direcionada 3",
    "body.agentSettings.flow.directedQuestions.3.prompt": "Pergunta direcionada 4",
    "body.agentSettings.flow.directedQuestions.3.objective": "Objetivo da pergunta direcionada 4",
    "body.agentSettings.flow.directedQuestions.4.prompt": "Pergunta direcionada 5",
    "body.agentSettings.flow.directedQuestions.4.objective": "Objetivo da pergunta direcionada 5",
    "body.agentSettings.flow.institutionalAdditionalInfo": "Informacoes institucionais adicionais",

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
    const wabaPhoneNumber = ensureMinLength(
      row["body.tenant.wabaPhoneNumber"] ?? row["body.waba_phone_number"],
      10,
      "+5511999999999",
    );
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

    // Extrair flow simplificado
    const briefingScope = ensureMinLength(row["body.agentSettings.flow.briefingScope"], 10, "Briefing juridico padrao");
    const rawMaxQuestions = Number(row["body.agentSettings.flow.maxQuestions"]);
    const maxQuestions = Number.isFinite(rawMaxQuestions) && rawMaxQuestions > 0 ? rawMaxQuestions : 5;

    const directedQuestions: AgentFlow["directedQuestions"] = [];
    const MAX_DIRECTED_QUESTIONS = 5;
    for (let i = 0; i < MAX_DIRECTED_QUESTIONS; i++) {
      const promptValue = row[`body.agentSettings.flow.directedQuestions.${i}.prompt`] as string;
      const objectiveValue = row[`body.agentSettings.flow.directedQuestions.${i}.objective`] as string;
      const prompt = (promptValue || "").trim();
      const objective = (objectiveValue || "").trim();
      if (prompt.length >= 3 && objective.length >= 3) {
        directedQuestions.push({ prompt, objective });
      }
    }

    const institutionalAdditionalInfo = (row["body.agentSettings.flow.institutionalAdditionalInfo"] as string)?.trim() || "";




    return {
      auth: {
        institutionId,
      },
      tenant: {
        companyName,
        businessHours,
        phoneNumber,
        wabaPhoneNumber,
        address: {
          street: addressStreet,
          city: addressCity,
          state: addressState,
          zipCode: addressZipCode,
        },
      },
      waba_phone_number: wabaPhoneNumber,
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
          briefingScope,
          directedQuestions,
          maxQuestions,
          institutionalAdditionalInfo,
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

        <Accordion type="multiple" className="space-y-4">
          {configs.map((config, index) => {
            const rowData = config as Record<string, unknown>;
            const institutionFromRow = rowData["body.auth.institutionId"];
            const institutionLabel =
              typeof institutionFromRow === "number" || typeof institutionFromRow === "string"
                ? String(institutionFromRow)
                : "N/D";
            const fallbackCompanyName =
              typeof config.id === "number" || typeof config.id === "string"
                ? "Escritorio " + String(config.id)
                : "Escritorio " + String(index + 1);
            const companyName =
              (rowData["body.tenant.companyName"] as string | undefined) ||
              fallbackCompanyName;

            const sections: Record<string, Array<[string, unknown]>> = {
              "Informacoes da Empresa": [],
              "Endereco": [],
              "Perfil do Agente": [],
              "Personalidade do Agente": [],
              "Etapas do Agente": [],
              "Fluxo de Atendimento": [],
              "Outros": [],
            };

            Object.entries(config)
              .filter(([key]) => key !== "id" && key !== "order")
              .forEach(([key, value]) => {
                if (
                  key.startsWith("body.tenant.companyName") ||
                  key.startsWith("body.tenant.businessHours") ||
                  key.startsWith("body.tenant.phoneNumber") ||
                  key.startsWith("body.tenant.wabaPhoneNumber")
                ) {
                  sections["Informacoes da Empresa"].push([key, value]);
                } else if (key.startsWith("body.tenant.address.")) {
                  sections["Endereco"].push([key, value]);
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
              <AccordionItem
                key={config.id ? "office-" + String(config.id) : "office-" + String(index)}
                value={"office-" + String(config.id ?? index)}
                className="rounded-lg border border-border/70 bg-background px-0"
              >
                <AccordionTrigger className="w-full px-4 py-3 text-left hover:no-underline">
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-foreground">
                      {companyName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Instituicao #{institutionLabel} - Registro #{config.id}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0">
                  <Card className="border-none shadow-none">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Dados do escritorio</CardTitle>
                          <CardDescription>
                            ID do registro: {config.id} | Instituicao #{institutionLabel}
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
                              value={"section-" + String(config.id ?? index) + "-" + String(sectionIndex)}
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>


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

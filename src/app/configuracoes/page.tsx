"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

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

type SectionLabel =
  | "Sobre a sua empresa"
  | "Quem fala com o seu cliente"
  | "Briefing juridico estruturado (perguntas)"
  | "Tom de voz e mensagens-chave"
  | "Arquivos de apoio";

type SectionRule = {
  label: SectionLabel;
  exact?: string[];
  dynamic?: Array<{
    prefix: string;
    allowedFields: string[];
  }>;
};

const SECTION_RULES: SectionRule[] = [
  {
    label: "Sobre a sua empresa",
    exact: [
      "body.tenant.companyName",
      "body.tenant.wabaPhoneNumber",
      "body.waba_phone_number",
      "body.tenant.address.fullAddress",
      "body.agentSettings.personality.greeting",
    ],
  },
  {
    label: "Quem fala com o seu cliente",
    exact: [
      "body.agentSettings.profile.agentName",
      "body.agentSettings.profile.personalityDescription",
      "body.agentSettings.profile.expertiseArea",
    ],
  },
  {
    label: "Briefing juridico estruturado (perguntas)",
    exact: [
      "body.agentSettings.flow.briefingScope",
      "body.agentSettings.flow.maxQuestions",
      "perguntas",
      "quantidadePerguntas",
      "body.agentSettings.flow.directedQuestionsList",
      "body.agentSettings.flow.institutionalAdditionalInfo",
    ],
  },
  {
    label: "Tom de voz e mensagens-chave",
    exact: [
      "body.agentSettings.personality.closing",
      "body.agentSettings.personality.forbiddenWords.0",
    ],
  },
  {
    label: "Arquivos de apoio",
    dynamic: [
      {
        prefix: "body.ragFiles.",
        allowedFields: ["name", "mime", "size", "storagePath", "tempUrl"],
      },
    ],
  },
];

const SECTION_ORDER: SectionLabel[] = [
  "Sobre a sua empresa",
  "Quem fala com o seu cliente",
  "Briefing juridico estruturado (perguntas)",
  "Tom de voz e mensagens-chave",
  "Arquivos de apoio",
];

const SECTION_METADATA: Record<
  SectionLabel,
  { title: string; description: string; fieldOrder: string[] }
> = {
  "Sobre a sua empresa": {
    title: "",
    description: "",
    fieldOrder: [
      "body.tenant.companyName",
      "body.tenant.wabaPhoneNumber",
      "body.waba_phone_number",
      "body.tenant.address.fullAddress",
      "body.agentSettings.personality.greeting",
    ],
  },
  "Quem fala com o seu cliente": {
    title: "",
    description: "",
    fieldOrder: [
      "body.agentSettings.profile.agentName",
      "body.agentSettings.profile.personalityDescription",
      "body.agentSettings.profile.expertiseArea",
    ],
  },
  "Briefing juridico estruturado (perguntas)": {
    title: "",
    description: "",
    fieldOrder: [
      "perguntas",
      "quantidadePerguntas",
      "body.agentSettings.flow.briefingScope",
      "body.agentSettings.flow.maxQuestions",
      "body.agentSettings.flow.directedQuestionsList",
      "body.agentSettings.flow.institutionalAdditionalInfo",
    ],
  },
  "Tom de voz e mensagens-chave": {
    title: "",
    description: "",
    fieldOrder: [
      "body.agentSettings.personality.closing",
      "body.agentSettings.personality.forbiddenWords.0",
    ],
  },
  "Arquivos de apoio": {
    title: "Arquivos de apoio",
    description:
      "Envie laudos, contratos, planilhas ou apresentações que o agente possa consultar durante o atendimento.",
    fieldOrder: ["body.ragFiles."],
  },
};

const EXACT_FIELD_SECTION = new Map<string, SectionLabel>();
const DYNAMIC_FIELD_RULES = SECTION_RULES.flatMap((rule) => {
  rule.exact?.forEach((key) => EXACT_FIELD_SECTION.set(key, rule.label));
  return (rule.dynamic ?? []).map((dynamicRule) => ({
    label: rule.label,
    prefix: dynamicRule.prefix,
    allowedFields: new Set(dynamicRule.allowedFields),
  }));
});

const getSectionLabelForKey = (key: string): SectionLabel | null => {
  const exact = EXACT_FIELD_SECTION.get(key);
  if (exact) {
    return exact;
  }

  for (const { prefix, allowedFields, label } of DYNAMIC_FIELD_RULES) {
    if (!key.startsWith(prefix)) continue;
    const remainder = key.slice(prefix.length);
    const [index, field, ...extra] = remainder.split(".");
    if (!index || Number.isNaN(Number.parseInt(index, 10))) {
      continue;
    }

    if (!field || extra.length > 0) {
      continue;
    }

    if (allowedFields.has(field)) {
      return label;
    }
  }

  return null;
};

const isOnboardingFieldKey = (key: string): boolean => {
  if (key === "id" || key === "order") {
    return false;
  }

  return getSectionLabelForKey(key) !== null;
};

const getFieldOrderValue = (label: SectionLabel, key: string): number => {
  const metadata = SECTION_METADATA[label];
  const order = metadata?.fieldOrder ?? [];

  for (let index = 0; index < order.length; index++) {
    const entry = order[index];
    if (entry.endsWith(".")) {
      if (key.startsWith(entry)) {
        const remainder = key.slice(entry.length);
        const [itemIndex, field] = remainder.split(".");
        const parsedIndex = Number.parseInt(itemIndex, 10);
        const base = Number.isFinite(parsedIndex) ? parsedIndex / 100 : 0;
        const fieldWeight = field === "objective" ? 0.5 : 0;
        return index + base + fieldWeight;
      }
    } else if (entry === key) {
      return index;
    }
  }

  return order.length + 1;
};

const sortSectionFields = (
  label: SectionLabel,
  fields: Array<[string, unknown]>,
) =>
  [...fields].sort((a, b) => {
    const diff =
      getFieldOrderValue(label, a[0]) - getFieldOrderValue(label, b[0]);
    if (diff !== 0) {
      return diff;
    }
    return a[0].localeCompare(b[0]);
  });

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { data, isHydrated } = useOnboarding();
  const [configs, setConfigs] = useState<BaserowConfigRow[]>([]);
  const [editingFields, setEditingFields] = useState<Record<number, Record<string, EditableField>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingToWebhook, setIsSendingToWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);


  useEffect(() => {
    if (!isHydrated) return;
    if (!data.auth) {
      router.push("/");
      return;
    }

    loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, data.auth]);

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
        const row = config as Record<string, unknown>;
        Object.entries(config).forEach(([key, value]) => {
          if (!isOnboardingFieldKey(key)) {
            return;
          }

          initialEditing[config.id][key] = {
            key,
            value,
            isEditing: false,
          };
        });

        // Sintetizar fullAddress a partir de campos legados se não existir
        if (!initialEditing[config.id]["body.tenant.address.fullAddress"]) {
          const legacyStreet = (row["body.tenant.address.street"] as string)?.trim() || "";
          const legacyCity = (row["body.tenant.address.city"] as string)?.trim() || "";
          const legacyState = (row["body.tenant.address.state"] as string)?.trim() || "";
          const legacyZip = (row["body.tenant.address.zipCode"] as string)?.trim() || "";
          const parts = [
            legacyStreet,
            legacyCity && legacyState ? `${legacyCity}/${legacyState}` : legacyCity || legacyState,
            legacyZip ? `CEP ${legacyZip}` : "",
          ].filter(Boolean);
          const synthesized = parts.join(" - ");
          if (synthesized) {
            initialEditing[config.id]["body.tenant.address.fullAddress"] = {
              key: "body.tenant.address.fullAddress",
              value: synthesized,
              isEditing: false,
            };
          }
        }
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
    "body.tenant.companyName": "Nome do escritório",
    "body.tenant.businessHours": "Horários de atendimento",
    "body.tenant.wabaPhoneNumber": "Número do WhatsApp conectado à Meta",
    "body.waba_phone_number": "Número do WhatsApp conectado à Meta",
    "body.tenant.address.fullAddress": "Endereço completo",
    "body.agentSettings.profile.agentName": "Nome do agente",
    "body.agentSettings.profile.language": "Idioma principal",
    "body.agentSettings.profile.personalityDescription": "Descrição da personalidade",
    "body.agentSettings.profile.expertiseArea": "Área de expertise",
    "body.agentSettings.flow.briefingScope": "Escopo do briefing",
    "body.agentSettings.flow.maxQuestions": "Limite máximo de perguntas",
    "perguntas": "Perguntas direcionadas",
    "quantidadePerguntas": "Quantidade de perguntas",
    "body.agentSettings.flow.directedQuestionsList": "Perguntas direcionadas (JSON)",
    "body.agentSettings.flow.institutionalAdditionalInfo": "Informações institucionais adicionais",
    "body.agentSettings.flow.companyOfferings": "Informações institucionais adicionais (legado)",
    "body.agentSettings.personality.greeting": "Saudação inicial",
    "body.agentSettings.personality.closing": "Frase de despedida",
    "body.agentSettings.personality.forbiddenWords.0": "Palavras proibidas",
  };

  const formatFieldName = (fieldName: string): string => {
    if (fieldNameMap[fieldName]) {
      return fieldNameMap[fieldName];
    }

    const questionMatch = fieldName.match(
      /^body\.agentSettings\.flow\.directedQuestions\.(\d+)\.(prompt|objective)$/,
    );
    if (questionMatch) {
      const index = Number.parseInt(questionMatch[1], 10) + 1;
      const label =
        questionMatch[2] === "objective" ? "Objetivo" : "Texto da pergunta";
      return `Pergunta ${index} - ${label}`;
    }

    const ragMatch = fieldName.match(
      /^body\.ragFiles\.(\d+)\.(name|mime|size|storagePath|tempUrl)$/,
    );
    if (ragMatch) {
      const index = Number.parseInt(ragMatch[1], 10) + 1;
      const propertyMap: Record<string, string> = {
        "name": "Nome",
        "mime": "Tipo do arquivo",
        "size": "Tamanho (bytes)",
        "storagePath": "Caminho",
        "tempUrl": "URL temporária",
      };
      const propertyLabel =
        propertyMap[ragMatch[2]] ?? ragMatch[2];
      return `Arquivo ${index} - ${propertyLabel}`;
    }

    return fieldName
      .replace(/body\./g, "")
      .replace(/\./g, " -> ");
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

    const parseQuestionList = (value: unknown): string[] => {
      if (!value) {
        return [];
      }
      if (Array.isArray(value)) {
        return value
          .map((entry) => {
            if (typeof entry === "string") {
              return entry.trim();
            }
            if (entry && typeof entry === "object") {
              const legacy = entry as { prompt?: string; objective?: string };
              return String(legacy.prompt ?? legacy.objective ?? "").trim();
            }
            return "";
          })
          .filter((question) => question.length > 0);
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
          return [];
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parseQuestionList(parsed);
          }
        } catch {
          // ignore parse error
        }
        return trimmed
          .split(/\r?\n|,|;/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      }
      return [];
    };
    
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
    // Endereço: campo único, com fallback para campos legados (street/city/state/zipCode)
    let fullAddress = (row["body.tenant.address.fullAddress"] as string)?.trim() || "";
    if (!fullAddress) {
      const legacyStreet = (row["body.tenant.address.street"] as string)?.trim() || "";
      const legacyCity = (row["body.tenant.address.city"] as string)?.trim() || "";
      const legacyState = (row["body.tenant.address.state"] as string)?.trim() || "";
      const legacyZip = (row["body.tenant.address.zipCode"] as string)?.trim() || "";
      const parts = [legacyStreet, legacyCity && legacyState ? `${legacyCity}/${legacyState}` : legacyCity || legacyState, legacyZip ? `CEP ${legacyZip}` : ""].filter(Boolean);
      fullAddress = parts.join(" - ") || "Endereço não informado";
    }
    fullAddress = ensureMinLength(fullAddress, 5, "Endereço não informado");

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

    // Extrair flow simplificado
    const rawBriefingScope =
      row["body.agentSettings.flow.briefingScope"] ??
      row["body.agentSettings.flow.greetingsScript"];
    const briefingScope = ensureMinLength(rawBriefingScope, 10, "Briefing juridico padrao");
    const rawMaxQuestions = Number(row["body.agentSettings.flow.maxQuestions"]);
    const fallbackMaxQuestions = asNumber(row["quantidadePerguntas"]);
    const maxQuestions =
      Number.isFinite(rawMaxQuestions) && rawMaxQuestions > 0
        ? rawMaxQuestions
        : fallbackMaxQuestions && fallbackMaxQuestions > 0
          ? fallbackMaxQuestions
          : 5;

    let directedQuestions: AgentFlow["directedQuestions"] = parseQuestionList(
      row["body.agentSettings.flow.directedQuestionsList"],
    );
    if (!directedQuestions.length) {
      directedQuestions = parseQuestionList(row["perguntas"]);
    }
    if (!directedQuestions.length) {
      const MAX_DIRECTED_QUESTIONS = 5;
      const fallback: string[] = [];
      for (let i = 0; i < MAX_DIRECTED_QUESTIONS; i++) {
        const promptValue =
          (row[`body.agentSettings.flow.directedQuestions.${i}.prompt`] as string) ??
          (row[`body.agentSettings.flow.viabilityQuestions.${i}.prompt`] as string);
        const objectiveValue =
          (row[`body.agentSettings.flow.directedQuestions.${i}.objective`] as string) ??
          (row[`body.agentSettings.flow.viabilityQuestions.${i}.objective`] as string);
        const question = (promptValue || objectiveValue || "").trim();
        if (question.length >= 3) {
          fallback.push(question);
        }
      }
      directedQuestions = fallback;
    }

    const institutionalAdditionalInfo =
      (row["body.agentSettings.flow.institutionalAdditionalInfo"] as string)?.trim() ||
      (row["body.agentSettings.flow.companyOfferings"] as string)?.trim() ||
      "";




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
          fullAddress,
        },
      },
      waba_phone_number: wabaPhoneNumber,
      agentSettings: {
        profile: {
          agentName,
          language:
            language as "Português (Brasil)" | "Inglês (EUA)" | "Espanhol (Latam)",
          personalityDescription,
          expertiseArea,
        },
        personality: {
          greeting,
          closing,
          forbiddenWords: finalForbiddenWords,
        },
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
    const isObject = typeof displayValue === "object" && displayValue !== null;
    const stringValue = formatValue(displayValue);

    if (isEditing) {
      return (
        <div className="space-y-2">
          {isObject ? (
            <Textarea
              autoFocus
              value={stringValue}
              onChange={(e) => {
                const parsed = parseValue(e.target.value, displayValue);
                updateFieldValue(rowId, fieldKey, parsed);
              }}
              onBlur={() => saveField(rowId, fieldKey)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditing(rowId, fieldKey);
              }}
              className="font-mono text-xs min-h-[200px]"
              rows={10}
            />
          ) : (
            <Input
              autoFocus
              type={typeof displayValue === "number" ? "number" : "text"}
              value={stringValue}
              onChange={(e) => {
                const parsed = parseValue(e.target.value, displayValue);
                updateFieldValue(rowId, fieldKey, parsed);
              }}
              onBlur={() => saveField(rowId, fieldKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveField(rowId, fieldKey);
                if (e.key === "Escape") cancelEditing(rowId, fieldKey);
              }}
              className="font-mono text-xs"
            />
          )}
        </div>
      );
    }

    return (
      <div
        className="cursor-pointer hover:bg-muted/50 rounded transition-colors"
        onClick={() => startEditing(rowId, fieldKey)}
      >
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
          {stringValue || <span className="italic">Clique para editar</span>}
        </pre>
      </div>
    );
  };

  if (isLoading) {
    return <LoadingScreen message="Carregando configurações..." />;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:gap-4">
{error && (
          <div className="border-b border-destructive px-3 sm:px-4 py-3">
            <p className="text-sm font-semibold text-destructive">Erro</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={loadConfigs} size="sm" className="mt-2">Tentar novamente</Button>
          </div>
        )}

        {successMessage && (
          <div className="border-b border-emerald-300 dark:border-emerald-700 px-3 sm:px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30">
            <p className="text-sm text-emerald-900 dark:text-emerald-100">{successMessage}</p>
          </div>
        )}


        {configs.length === 0 && !error && (
          <div className="py-12 text-center text-muted-foreground">
            Nenhuma configuração encontrada para esta instituição (ID: {data.auth?.institutionId}).
          </div>
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
                ? "Escritório " + String(config.id)
                : "Escritório " + String(index + 1);
            const companyName =
              (rowData["body.tenant.companyName"] as string | undefined) ||
              fallbackCompanyName;

            const sections = SECTION_ORDER.reduce(
              (acc, label) => {
                acc[label] = [];
                return acc;
              },
              {} as Record<SectionLabel, Array<[string, unknown]>>,
            );

            Object.entries(config).forEach(([key, value]) => {
              if (!isOnboardingFieldKey(key)) {
                return;
              }
              const sectionLabel = getSectionLabelForKey(key);
              if (!sectionLabel) {
                return;
              }
              sections[sectionLabel].push([key, value]);
            });

            // Sintetizar campo fullAddress a partir dos campos legados se não existir
            const empresaSection = sections["Sobre a sua empresa"];
            if (!empresaSection.some(([k]) => k === "body.tenant.address.fullAddress")) {
              const legacyStreet = (rowData["body.tenant.address.street"] as string)?.trim() || "";
              const legacyCity = (rowData["body.tenant.address.city"] as string)?.trim() || "";
              const legacyState = (rowData["body.tenant.address.state"] as string)?.trim() || "";
              const legacyZip = (rowData["body.tenant.address.zipCode"] as string)?.trim() || "";
              const parts = [
                legacyStreet,
                legacyCity && legacyState ? `${legacyCity}/${legacyState}` : legacyCity || legacyState,
                legacyZip ? `CEP ${legacyZip}` : "",
              ].filter(Boolean);
              const synthesized = parts.join(" - ");
              if (synthesized) {
                empresaSection.push(["body.tenant.address.fullAddress", synthesized]);
              }
            }

            let sectionRenderIndex = 0;

            return (
              <AccordionItem
                key={config.id ? "office-" + String(config.id) : "office-" + String(index)}
                value={"office-" + String(config.id ?? index)}
                className="border-b border-[#7E99B5] dark:border-border/60 px-0"
              >
                <AccordionTrigger className="w-full px-3 sm:px-4 py-3 text-left hover:no-underline">
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-foreground">
                      {companyName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Instituição #{institutionLabel} - Registro #{config.id}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 sm:px-4 pt-2">
                  <div className="pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Dados do escritório</p>
                        <p className="text-xs text-muted-foreground">
                          ID do registro: {config.id} | Instituição #{institutionLabel}
                        </p>
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
                      {SECTION_ORDER.map((label) => {
                        const fields = sections[label];
                        if (!fields.length) {
                          return null;
                        }
                        const blockIndex = sectionRenderIndex++;
                        const metadata = SECTION_METADATA[label];
                        const sortedFields = sortSectionFields(label, fields);

                        return (
                          <div
                            key={label}
                            className={`space-y-4 ${
                              blockIndex > 0 ? "mt-6 border-t border-border/60 pt-6" : ""
                            }`}
                          >
                            <div className="space-y-1">
                              <p className="text-base font-semibold text-foreground">
                                {metadata?.title ?? label}
                              </p>
                              {metadata?.description ? (
                                <p className="text-sm text-muted-foreground">
                                  {metadata.description}
                                </p>
                              ) : null}
                            </div>
                            <div className="space-y-4">
                              {sortedFields.map(([key, value]) => (
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
                          </div>
                        );
                      })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>


        <div className="flex items-center justify-center gap-4 py-6">
          <Button variant="outline" onClick={loadConfigs} disabled={isLoading || isSendingToWebhook}>
            Recarregar
          </Button>
          <Button
            onClick={handleSendToWebhook}
            disabled={isLoading || isSendingToWebhook || configs.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSendingToWebhook ? "Enviando..." : "Atualizar e Enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

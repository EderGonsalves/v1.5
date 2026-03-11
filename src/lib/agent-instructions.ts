/**
 * Definições de instruções modulares do agente.
 * Cada instrução mapeia para um ou mais campos Baserow.
 */

export const INSTRUCTION_TYPES = [
  "greeting",
  "agentName",
  "personalityDescription",
  "expertiseArea",
  "briefingScope",
  "directedQuestions",
  "maxQuestions",
  "institutionalAdditionalInfo",
  "qualificationRules",
  "disqualificationMessage",
  "closingMessage",
  "agendamento",
  "assinatura_documentos",
  "acompanhamento_processual",
] as const;

export type InstructionType = (typeof INSTRUCTION_TYPES)[number];

export type InstructionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "list"
  | "toggle";

export type InstructionDefinition = {
  type: InstructionType;
  label: string;
  description: string;
  fieldType: InstructionFieldType;
  /** Chave Baserow usada para ler/gravar */
  baserowKey: string;
  /** Placeholder ou dica para o campo */
  placeholder?: string;
};

export const INSTRUCTION_DEFINITIONS: Record<
  InstructionType,
  InstructionDefinition
> = {
  greeting: {
    type: "greeting",
    label: "Saudação inicial",
    description: "Mensagem de boas-vindas que o agente envia ao iniciar a conversa.",
    fieldType: "text",
    baserowKey: "body.agentSettings.personality.greeting",
    placeholder: "Olá! Sou a assistente do escritório. Como posso te ajudar?",
  },
  agentName: {
    type: "agentName",
    label: "Nome do agente",
    description: "Nome pelo qual o agente se apresenta ao cliente.",
    fieldType: "text",
    baserowKey: "body.agentSettings.profile.agentName",
    placeholder: "Assistente Jurídico RIA",
  },
  personalityDescription: {
    type: "personalityDescription",
    label: "Personalidade do agente",
    description: "Descreva como o agente deve se comportar e se comunicar.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.profile.personalityDescription",
    placeholder:
      "Especialista em atendimento jurídico que recebe o cliente com cordialidade...",
  },
  expertiseArea: {
    type: "expertiseArea",
    label: "Área de expertise",
    description: "Áreas do direito ou especialidades em que o agente atua.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.profile.expertiseArea",
    placeholder: "Direito previdenciário, consumerista e cível...",
  },
  briefingScope: {
    type: "briefingScope",
    label: "Escopo do briefing",
    description: "Defina o foco da coleta de informações do agente.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.flow.briefingScope",
    placeholder:
      "Coletar dados essenciais para briefings jurídicos antes da revisão humana...",
  },
  directedQuestions: {
    type: "directedQuestions",
    label: "Perguntas direcionadas",
    description:
      "Lista de perguntas que o agente deve fazer ao cliente. Uma por linha.",
    fieldType: "list",
    baserowKey: "body.agentSettings.flow.directedQuestionsList",
    placeholder: "Quando o problema jurídico começou?",
  },
  maxQuestions: {
    type: "maxQuestions",
    label: "Limite de perguntas",
    description: "Número máximo de perguntas que o agente pode fazer (1-20).",
    fieldType: "number",
    baserowKey: "body.agentSettings.flow.maxQuestions",
  },
  institutionalAdditionalInfo: {
    type: "institutionalAdditionalInfo",
    label: "Info institucional adicional",
    description:
      "Informações extras sobre o escritório que o agente pode usar nas respostas.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.flow.institutionalAdditionalInfo",
    placeholder:
      "Atendimento 100% digital com especialistas dedicados...",
  },
  qualificationRules: {
    type: "qualificationRules",
    label: "Regras de qualificação",
    description:
      "Critérios que o agente usa para qualificar ou desqualificar clientes.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.flow.qualificationPrompt",
    placeholder:
      'Se o cliente mora fora do Brasil, informar que não atendemos casos internacionais...',
  },
  disqualificationMessage: {
    type: "disqualificationMessage",
    label: "Mensagem de desqualificação",
    description: "Mensagem enviada ao cliente quando não atende os critérios.",
    fieldType: "text",
    baserowKey: "body.agentSettings.flow.qualificationFallback",
    placeholder:
      "Agradecemos seu contato, mas infelizmente não conseguimos atender este tipo de demanda.",
  },
  closingMessage: {
    type: "closingMessage",
    label: "Mensagem de fechamento",
    description:
      "Mensagem enviada pelo agente ao encerrar o atendimento.",
    fieldType: "textarea",
    baserowKey: "body.agentSettings.flow.closingMessage",
    placeholder:
      "Agradeço por compartilhar seu relato. Em breve um especialista entrará em contato.",
  },
  agendamento: {
    type: "agendamento",
    label: "Agendamento de reunião",
    description:
      "O agente oferece horários disponíveis para agendar reunião com especialista.",
    fieldType: "toggle",
    baserowKey: "body.agentSettings.flow.commitmentScript",
  },
  assinatura_documentos: {
    type: "assinatura_documentos",
    label: "Assinatura de documentos",
    description:
      "O agente envia documento para assinatura eletrônica via RIA Sign.",
    fieldType: "toggle",
    baserowKey: "body.agentSettings.flow.commitmentScript",
  },
  acompanhamento_processual: {
    type: "acompanhamento_processual",
    label: "Acompanhamento processual",
    description: "Monitoramento automático de processos judiciais.",
    fieldType: "toggle",
    baserowKey: "body.agentSettings.flow.commitmentScript",
  },
};

/** Tipos que são toggles de funcionalidades (compartilham commitmentScript) */
const TOGGLE_TYPES: InstructionType[] = [
  "agendamento",
  "assinatura_documentos",
  "acompanhamento_processual",
];

/**
 * Lê a row Baserow e retorna as instruções que têm valor preenchido.
 */
export function readActiveInstructions(
  row: Record<string, unknown>,
): Map<InstructionType, unknown> {
  const active = new Map<InstructionType, unknown>();

  // Ler toggles do commitmentScript
  let commitmentFeatures: Record<string, boolean> = {};
  try {
    const raw = row["body.agentSettings.flow.commitmentScript"];
    if (typeof raw === "string" && raw.trim().startsWith("{")) {
      commitmentFeatures = JSON.parse(raw);
    }
  } catch {
    // fallback
  }

  for (const type of INSTRUCTION_TYPES) {
    const def = INSTRUCTION_DEFINITIONS[type];

    if (TOGGLE_TYPES.includes(type)) {
      // Toggles sempre ativos — mostrar com valor do JSON
      active.set(type, commitmentFeatures[type] ?? false);
      continue;
    }

    const rawValue = row[def.baserowKey];

    if (type === "directedQuestions") {
      const list = parseQuestionList(rawValue);
      if (list.length > 0) {
        active.set(type, list);
      }
      continue;
    }

    if (type === "maxQuestions") {
      const num = Number(rawValue);
      if (Number.isFinite(num) && num > 0) {
        active.set(type, num);
      }
      continue;
    }

    // text/textarea — valor preenchido
    if (typeof rawValue === "string" && rawValue.trim() !== "") {
      active.set(type, rawValue.trim());
    }
  }

  return active;
}

/**
 * Converte Map de instruções ativas → campos Baserow para salvar.
 */
export function buildInstructionFields(
  instructions: Map<InstructionType, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Montar commitmentScript a partir dos toggles
  const commitment: Record<string, boolean> = {};
  for (const toggleType of TOGGLE_TYPES) {
    commitment[toggleType] = instructions.get(toggleType) === true;
  }
  fields["body.agentSettings.flow.commitmentScript"] =
    JSON.stringify(commitment);

  for (const [type, value] of instructions) {
    const def = INSTRUCTION_DEFINITIONS[type];

    // Toggles já foram processados acima
    if (TOGGLE_TYPES.includes(type)) continue;

    if (type === "directedQuestions") {
      const list = Array.isArray(value)
        ? (value as string[]).filter((q) => q.trim() !== "")
        : [];
      fields["body.agentSettings.flow.directedQuestionsList"] =
        JSON.stringify(list);
      fields["perguntas"] = list.join("\n");
      fields["quantidadePerguntas"] = list.length;
      continue;
    }

    if (type === "maxQuestions") {
      fields[def.baserowKey] = Number(value) || 5;
      continue;
    }

    // text/textarea
    fields[def.baserowKey] = typeof value === "string" ? value : "";
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function parseQuestionList(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const legacy = entry as { prompt?: string; objective?: string };
          return String(legacy.prompt ?? legacy.objective ?? "").trim();
        }
        return "";
      })
      .filter((q) => q.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseQuestionList(parsed);
    } catch {
      // não é JSON
    }
    return trimmed
      .split(/\r?\n|;/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return [];
}

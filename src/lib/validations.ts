import { z } from "zod";

export const companyInfoSchema = z.object({
  companyName: z.string().min(2, "Informe o nome do escritório"),
  businessHours: z.string().min(2, "Descreva os horários de atendimento"),
  phoneNumber: z.string().min(10, "Informe um número de telefone válido"),
});

export const agentLanguages = [
  "Português (Brasil)",
  "Inglês (EUA)",
  "Espanhol (Latam)",
] as const;

export const agentProfileSchema = z.object({
  agentName: z.string().min(2, "Informe o nome do agente"),
  language: z.enum(agentLanguages, {
    message: "Selecione o idioma principal",
  }),
  personalityDescription: z
    .string()
    .min(10, "Descreva a personalidade do agente"),
  expertiseArea: z.string().min(5, "Liste a área de expertise do agente"),
});

export const stageNames = ["Saudação", "Depoimento", "Perguntas", "Fechamento"] as const;

export const agentStageSchema = z.object({
  stage: z.enum(stageNames),
  agent: z.string().min(2, "Informe o nome do agente responsável"),
  mission: z.string().min(10, "Descreva a missão da etapa"),
  script: z.string().min(10, "Forneça um roteiro base"),
});

export const agentStagesFormSchema = z.object({
  stages: z
    .array(agentStageSchema)
    .length(stageNames.length, "Configure todas as etapas do fluxo"),
});

export const commitmentTypes = ["contrato", "agendamento"] as const;

export const viabilityQuestionSchema = z.object({
  prompt: z.string().min(5, "Descreva a pergunta com clareza"),
  objective: z.string().min(5, "Explique o motivo da pergunta"),
});

export const agentFlowSchema = z.object({
  greetingsScript: z.string().min(10, "Informe como o agente se apresenta"),
  companyOfferings: z.string().min(5, "Liste brevemente em quais nichos atua"),
  qualificationPrompt: z.string().min(5, "Defina a pergunta de qualificação"),
  qualificationFallback: z.string().min(5, "Informe como proceder quando o lead recusar ou tiver dúvida"),
  viabilityQuestions: z
    .array(viabilityQuestionSchema)
    .min(2, "Cadastre ao menos duas perguntas de viabilidade"),
  disqualificationRules: z.string().min(5, "Explique as regras de desqualificação"),
  commitmentType: z.enum(commitmentTypes),
  commitmentScript: z.string().min(10, "Explique como propor a assinatura ou agendamento"),
  documentsChecklist: z
    .array(z.string().min(3, "Descreva o documento"))
    .min(1, "Liste ao menos um documento"),
  documentConfirmationMessage: z
    .string()
    .min(5, "Defina como o agente confirma o recebimento dos documentos"),
  closingMessage: z.string().min(5, "Defina como o canal e encerrado"),
  followUpRules: z.string().min(5, "Explique como manter o canal aberto"),
  skippableStages: z.array(z.enum(stageNames)),
});

export const ragFileSchema = z.object({
  name: z.string().min(1),
  mime: z.string().min(2),
  size: z.number().gt(0),
  storagePath: z.string().min(1),
  tempUrl: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email("Informe um e-mail valido"),
  password: z.string().min(4, "Informe a senha de acesso"),
});

export const addressSchema = z.object({
  street: z.string().min(2, "Informe a rua"),
  city: z.string().min(2, "Informe a cidade"),
  state: z.string().min(2, "Informe o estado"),
  zipCode: z
    .string()
    .min(5, "CEP inválido")
    .max(9, "CEP deve ter no máximo 9 caracteres"),
});

export const agentPersonalityFormSchema = z.object({
  greeting: z.string().min(2, "Descreva a saudação inicial"),
  closing: z.string().min(2, "Descreva a frase de despedida"),
  forbiddenWords: z
    .string()
    .min(2, "Separe as palavras proibidas com vírgula"),
});

export const agentPersonalitySchema = z.object({
  greeting: z.string().min(2, "Descreva a saudação inicial"),
  closing: z.string().min(2, "Descreva a frase de despedida"),
  forbiddenWords: z.array(z.string().min(1)).min(1, "Adicione ao menos uma palavra proibida"),
});

export const onboardingSchema = z.object({
  companyInfo: companyInfoSchema,
  address: addressSchema,
  agentProfile: agentProfileSchema,
  agentStages: agentStagesFormSchema.shape.stages,
  agentPersonality: agentPersonalityFormSchema,
  agentFlow: agentFlowSchema,
  ragFiles: z.array(ragFileSchema),
});

export type CompanyInfo = z.infer<typeof companyInfoSchema>;
export type AddressInfo = z.infer<typeof addressSchema>;
export type AgentPersonalityFormValues = z.infer<
  typeof agentPersonalityFormSchema
>;
export type AgentPersonality = z.infer<typeof agentPersonalitySchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type AgentStage = z.infer<typeof agentStageSchema>;
export type AgentStagesFormValues = z.infer<typeof agentStagesFormSchema>;
export type ViabilityQuestion = z.infer<typeof viabilityQuestionSchema>;
export type AgentFlow = z.infer<typeof agentFlowSchema>;
export type RagFile = z.infer<typeof ragFileSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;

export const whatsAppConnectionSchema = z.object({
  connected: z.boolean().default(false),
  connectedAt: z.string().optional(),
  accountId: z.string().optional(),
  phoneNumberId: z.string().optional(),
});

export type WhatsAppConnection = z.infer<typeof whatsAppConnectionSchema>;

export const connectionsSchema = z.object({
  whatsApp: whatsAppConnectionSchema.optional(),
});

export type Connections = z.infer<typeof connectionsSchema>;

export type AuthInfo = {
  institutionId: number;
  token?: string;
  expiresAt?: string;
  payload?: Record<string, unknown>;
};

export type OnboardingData = {
  companyInfo: CompanyInfo;
  address: AddressInfo;
  agentProfile: AgentProfile;
  agentStages: AgentStage[];
  agentPersonality: AgentPersonality;
  agentFlow: AgentFlow;
  ragFiles: RagFile[];
  connections?: Connections;
  auth: AuthInfo | null;
  includedSteps: {
    companyInfo: boolean;
    address: boolean;
    agentProfile: boolean;
    agentFlow: boolean;
    agentPersonality: boolean;
    ragUpload: boolean;
  };
};

export const defaultCompanyInfo: CompanyInfo = {
  companyName: "",
  businessHours: "",
  phoneNumber: "",
};

export const defaultAgentProfile: AgentProfile = {
  agentName: "",
  language: "Português (Brasil)",
  personalityDescription: "",
  expertiseArea: "",
};

export const defaultAgentStages: AgentStage[] = [
  {
    stage: "Saudação",
    agent: "Clara - Especialista em recepção",
    mission:
      "Abrir o atendimento com mensagem institucional e posicionar o cliente sobre nossa atuação em BPC/LOAS e casos de superendividamento.",
    script:
      "Olá! Seja bem-vindo ao nosso escritório. Atuamos em benefícios BPC/LOAS e também em defesa de servidores superendividados. Para eu te acompanhar por aqui, me conta seu primeiro nome?",
  },
  {
    stage: "Depoimento",
    agent: "Bruno - Curador de relatos",
    mission:
      "Acolher e coletar o depoimento do cliente conectando sintomas de saúde, renda ou percentual de desconto sem quebrar o fluxo.",
    script:
      "Obrigado por confiar na gente. Conta rapidamente qual é a sua situação hoje: você enfrenta alguma limitação de saúde de longo prazo ou está com o salário comprometido em mais de 60% em dívidas?",
  },
  {
    stage: "Perguntas",
    agent: "Lia - Analista de viabilidade",
    mission:
      "Conduzir a bateria de perguntas objetivas (saúde, renda, descontos, documentos) sempre uma por vez, usando o roteiro oficial.",
    script:
      "Perfeito. Vou seguir com algumas perguntas rápidas: você trabalha registrado ou recebe algum benefício? Os descontos em folha somam mais de 60% do salário líquido? Preciso dessas informações para concluir a análise.",
  },
  {
    stage: "Fechamento",
    agent: "Rafa - Especialista em fechamento",
    mission:
      "Recapitular a análise, confirmar próximos passos, orientar sobre assinatura/documentos e manter o canal aberto enquanto aciona o advogado responsável.",
    script:
      "Com o que você compartilhou já consigo montar o parecer e acionar o advogado orquestrador. Em seguida envio o resumo com orientações, contrato e lista de documentos. Posso confirmar esse encaminhamento?",
  },
];

export const defaultAddress: AddressInfo = {
  street: "",
  city: "",
  state: "",
  zipCode: "",
};

export const defaultAgentPersonality: AgentPersonality = {
  greeting: "",
  closing: "",
  forbiddenWords: [],
};

export const defaultAgentFlow: AgentFlow = {
  greetingsScript:
    "Olá! Seja bem-vindo ao nosso escritório. Atendemos demandas previdenciárias, consumeristas e bancárias em todo o Brasil. Qual é o seu primeiro nome?",
  companyOfferings:
    "Atuamos com benefícios assistenciais, defesa em superendividamento e causas sob demanda (trabalhistas, tributárias, empresariais).",
  qualificationPrompt:
    "Posso realizar uma análise gratuita agora mesmo para entender se o seu caso possui viabilidade?",
  qualificationFallback:
    "Sem problemas. Quando quiser retomar, este canal continua aberto e posso refazer a análise gratuitamente.",
  viabilityQuestions: [
    {
      prompt: "Você possui renda formal ou benefícios ativos? Se sim, quais valores?",
      objective: "Mapear se a renda passa do limite de concessão ou se há desconto abusivo acima do permitido.",
    },
    {
      prompt: "Quais documentos ou relatórios você já possui para comprovar a situação?",
      objective: "Entender se há elementos mínimos para montar o dossiê inicial.",
    },
  ],
  disqualificationRules:
    "Desqualifique se o cliente possuir renda superior ao limite legal sem possibilidade de flexibilização ou se não houver descontos abusivos.",
  commitmentType: "contrato",
  commitmentScript:
    "Vou encaminhar o contrato digital para você assinar agora mesmo e já abrir o chamado com o advogado responsável.",
  documentsChecklist: ["Documento de identificação", "Comprovante de residência", "Contracheque/Extrato mais recente"],
  documentConfirmationMessage:
    "Assim que receber cada arquivo confirmo por aqui e te aviso o que ainda esta pendente.",
  closingMessage:
    "Perfeito! Com esses dados consigo finalizar o protocolo. Se surgir qualquer novidade, pode me chamar neste mesmo número.",
  followUpRules:
    "Não encerre o canal de forma brusca. Informe que o advogado dará continuidade e que qualquer atualização chegará primeiro por aqui.",
  skippableStages: [],
};

export const defaultOnboardingData: OnboardingData = {
  companyInfo: defaultCompanyInfo,
  address: defaultAddress,
  agentProfile: defaultAgentProfile,
  agentStages: defaultAgentStages,
  agentPersonality: defaultAgentPersonality,
  agentFlow: defaultAgentFlow,
  ragFiles: [],
  connections: {
    whatsApp: {
      connected: false,
    },
  },
  auth: null,
  includedSteps: {
    companyInfo: true,
    address: true,
    agentProfile: true,
    agentFlow: true,
    agentPersonality: true,
    ragUpload: true,
  },
};

export const agentFormValuesFromPersonality = (
  value: AgentPersonality,
): AgentPersonalityFormValues => ({
  greeting: value.greeting,
  closing: value.closing,
  forbiddenWords: value.forbiddenWords.join(", "),
});

export const agentPersonalityFromFormValues = (
  values: AgentPersonalityFormValues,
): AgentPersonality => ({
  greeting: values.greeting,
  closing: values.closing,
  forbiddenWords: values.forbiddenWords
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean),
});

export const onboardingPayloadSchema = z.object({
  auth: z.object({
    institutionId: z.number(),
  }),
  tenant: z.object({
    companyName: companyInfoSchema.shape.companyName,
    businessHours: companyInfoSchema.shape.businessHours,
    phoneNumber: companyInfoSchema.shape.phoneNumber,
    address: addressSchema,
  }),
  agentSettings: z.object({
    profile: agentProfileSchema,
    personality: agentPersonalitySchema,
    stages: agentStagesFormSchema.shape.stages,
    flow: agentFlowSchema,
  }),
  ragFiles: z.array(ragFileSchema),
  includedSteps: z.object({
    companyInfo: z.boolean(),
    address: z.boolean(),
    agentProfile: z.boolean(),
    agentFlow: z.boolean(),
    agentPersonality: z.boolean(),
    ragUpload: z.boolean(),
  }).optional(),
});

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;

export const buildOnboardingPayload = (
  data: OnboardingData,
): OnboardingPayload => {
  if (!data.auth) {
    throw new Error("Dados de login nao encontrados. Faca o login novamente.");
  }

  return {
    auth: data.auth,
    tenant: {
      companyName: data.companyInfo.companyName,
      businessHours: data.companyInfo.businessHours,
      phoneNumber: data.companyInfo.phoneNumber,
      address: data.address,
    },
    agentSettings: {
      profile: data.agentProfile,
      personality: data.agentPersonality,
      stages: data.agentStages,
      flow: data.agentFlow,
    },
    ragFiles: data.ragFiles,
    includedSteps: data.includedSteps,
  };
};

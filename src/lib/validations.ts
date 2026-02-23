import { z } from "zod";



export const companyInfoSchema = z.object({

  companyName: z.string().min(2, "Informe o nome do escritorio"),

  businessHours: z.string().min(2, "Descreva os horarios de atendimento"),

  phoneNumber: z

    .string()

    .min(10, "Informe um numero de telefone valido")

    .optional()

    .or(z.literal("")),

  wabaPhoneNumber: z

    .string()

    .min(10, "Informe o numero do WhatsApp conectado a Meta"),

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

  expertiseArea: z.string().min(5, "Liste a Area de expertise do agente"),

});



export const stageNames = ["Saudação", "Depoimento", "Perguntas", "Fechamento"] as const;



export const agentStageSchema = z.object({

  stage: z.enum(stageNames),

  agent: z.string().min(2, "Informe o nome do agente responsAvel"),

  mission: z.string().min(10, "Descreva a missAo da etapa"),

  script: z.string().min(10, "ForneAa um roteiro base"),

});



export const agentStagesFormSchema = z.object({

  stages: z

    .array(agentStageSchema)

    .length(stageNames.length, "Configure todas as etapas do fluxo"),

});



export const commitmentTypes = ["contrato", "agendamento"] as const;



export const directedQuestionSchema = z
  .string()
  .min(5, "Descreva a pergunta com clareza");



export const agentFlowSchema = z.object({
  briefingScope: z
    .string()
    .min(10, "Explique qual e o foco do briefing")
    .trim(),

  directedQuestions: z
    .array(directedQuestionSchema)
    .max(20, "Cadastre no maximo 20 perguntas"),

  maxQuestions: z
    .number({
      message: "Informe o limite maximo de perguntas",
    })
    .int("Use apenas numeros inteiros")
    .min(1, "Defina ao menos uma pergunta")
    .max(20, "Use no maximo 20 perguntas"),

  institutionalAdditionalInfo: z.string().trim(),
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
  fullAddress: z.string().min(5, "Informe o endereço completo"),
});



export const agentPersonalityFormSchema = z.object({

  greeting: z.string().min(2, "Descreva a saudaAAo inicial"),

  closing: z.string().min(2, "Descreva a frase de despedida"),

  forbiddenWords: z

    .string()

    .min(2, "Separe as palavras proibidas com vArgula"),

});



export const agentPersonalitySchema = z.object({

  greeting: z.string().min(2, "Descreva a saudaAAo inicial"),

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

export type DirectedQuestion = z.infer<typeof directedQuestionSchema>;

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
  legacyUserId?: string;
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

  configurationMode: "simple" | "advanced";

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
  companyName: "Escritório Modelo & Associados",
  businessHours: "Segunda a sexta, das 8h às 18h",
  phoneNumber: "+5511999999999",
  wabaPhoneNumber: "+5511999999999",
};



export const defaultAgentProfile: AgentProfile = {
  agentName: "Assistente Jurídico RIA",
  language: "Português (Brasil)",
  personalityDescription: "Especialista em atendimento jurídico que recebe o cliente com cordialidade, organiza o briefing e entrega segurança em cada etapa.",
  expertiseArea: "Direito previdenciário, consumerista e cível com foco em superendividamento e concessão de benefícios.",
};



export const defaultAgentStages: AgentStage[] = [
  {
    stage: "Saudação",
    agent: "Clara - Pré-atendimento",
    mission:
      "Dar boas-vindas, explicar que atuamos em todo o Brasil e informar que o briefing será encaminhado ao time jurídico.",
    script:
      "Olá! Eu sou a Clara, assistente do {{company_name}}. Posso conduzir um breve questionário para direcionar seu caso ao advogado responsável?",
  },
  {
    stage: "Depoimento",
    agent: "Bruno - Analista de casos",
    mission:
      "Coletar o relato livre do cliente, garantindo tom empático e registrando fatos relevantes para o jurídico.",
    script:
      "Perfeito, vou anotar tudo o que aconteceu até aqui e, se precisar, faço perguntas adicionais para deixar o dossiê completo.",
  },
  {
    stage: "Perguntas",
    agent: "Marina - Especialista de viabilidade",
    mission:
      "Aplicar perguntas direcionadas, validar documentos e confirmar se o caso atende aos critérios do escritório.",
    script:
      "Vou confirmar algumas informações para garantir que o time jurídico receba tudo organizado, combinado?",
  },
  {
    stage: "Fechamento",
    agent: "Rafa - Especialista em fechamento",
    mission:
      "Recapitular o plano de ação, explicar próximos passos e informar canais de continuidade.",
    script:
      "Com o que você compartilhou já consigo acionar o advogado responsável. Em seguida te envio o resumo com orientações e, se necessário, o contrato digital.",
  },
];



export const defaultAddress: AddressInfo = {
  fullAddress: "Av. Paulista, 1000 - São Paulo/SP - CEP 01310-100",
};



export const defaultAgentPersonality: AgentPersonality = {
  greeting:
    "Sou a assistente virtual do seu escritório e vou acompanhar você em todo o processo. Como posso te ajudar hoje?",
  closing:
    "Agradeço pelas informações. Estarei por aqui para qualquer atualização e o time jurídico continuará o atendimento.",
  forbiddenWords: ["promessa", "garantia", "desculpa"],
};



export const defaultAgentFlow: AgentFlow = {
  briefingScope:
    "Coletar dados essenciais para briefings juridicos antes da revisao humana, garantindo que o cliente saiba que atuamos em todo o Brasil.",
  directedQuestions: [
    "Quando o problema juridico comecou e qual foi o gatilho principal?",
    "Voce ja acionou algum orgao, advogado ou protocolo oficial?",
  ],
  maxQuestions: 6,
  institutionalAdditionalInfo:
    "Atendimento 100% digital com especialistas dedicados e canal direto para documentacao complementar.",
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

  configurationMode: "advanced",

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

    wabaPhoneNumber: companyInfoSchema.shape.wabaPhoneNumber,

    address: addressSchema,

  }),

  waba_phone_number: companyInfoSchema.shape.wabaPhoneNumber,

  agentSettings: z.object({
    profile: agentProfileSchema,
    personality: agentPersonalitySchema,
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

      wabaPhoneNumber: data.companyInfo.wabaPhoneNumber,

      address: data.address,

    },

    waba_phone_number: data.companyInfo.wabaPhoneNumber,

    agentSettings: {
      profile: data.agentProfile,
      personality: data.agentPersonality,
      flow: data.agentFlow,
    },

    ragFiles: data.ragFiles,

    includedSteps: data.includedSteps,

  };

};

import type { OnboardingPayload, AgentPhaseConfig } from "@/lib/validations";

const ensureString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

export const buildBaserowRowFromPayload = (
  payload: OnboardingPayload,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  const { tenant, agentSettings } = payload;

  data["body.auth.institutionId"] = payload.auth?.institutionId ?? "";

  data["body.tenant.companyName"] = ensureString(tenant.companyName);
  data["body.tenant.businessHours"] = ensureString(tenant.businessHours);
  data["body.tenant.phoneNumber"] = ensureString(tenant.phoneNumber);
  data["body.tenant.wabaPhoneNumber"] = ensureString(tenant.wabaPhoneNumber);
  data["body.waba_phone_number"] =
    ensureString(payload.waba_phone_number ?? tenant.wabaPhoneNumber);

  const address = tenant.address ?? { fullAddress: "" };
  data["body.tenant.address.fullAddress"] = ensureString(address.fullAddress);

  const profile = agentSettings.profile;
  data["body.agentSettings.profile.agentName"] = ensureString(
    profile.agentName,
  );
  data["body.agentSettings.profile.language"] = ensureString(profile.language);
  data["body.agentSettings.profile.personalityDescription"] = ensureString(
    profile.personalityDescription,
  );
  data["body.agentSettings.profile.expertiseArea"] = ensureString(
    profile.expertiseArea,
  );

  const personality = agentSettings.personality;
  data["body.agentSettings.personality.greeting"] = ensureString(
    personality.greeting,
  );
  data["body.agentSettings.personality.closing"] = ensureString(
    personality.closing,
  );
  data["body.agentSettings.personality.forbiddenWords.0"] = personality
    .forbiddenWords?.length
    ? personality.forbiddenWords.join(", ")
    : "";

  const flow = agentSettings.flow;
  const briefingScope = ensureString(flow.briefingScope);
  data["body.agentSettings.flow.briefingScope"] = briefingScope;
  data["body.agentSettings.flow.greetingsScript"] = briefingScope;

  data["body.agentSettings.flow.maxQuestions"] = flow.maxQuestions ?? 0;

  const institutionalInfo = ensureString(flow.institutionalAdditionalInfo ?? "");
  data["body.agentSettings.flow.institutionalAdditionalInfo"] = institutionalInfo;
  data["body.agentSettings.flow.companyOfferings"] = institutionalInfo;

  const directedQuestionsList = (flow.directedQuestions ?? [])
    .map((question) => ensureString(question).trim())
    .filter((question) => question.length > 0);
  data["body.agentSettings.flow.directedQuestionsList"] = JSON.stringify(
    directedQuestionsList,
  );
  data["perguntas"] = directedQuestionsList.join("\n");
  data["quantidadePerguntas"] = directedQuestionsList.length;

  // Ativar IA por padrão no onboarding inicial
  data["ia_ativada"] = "sim";

  // Fases do agente (campos stages ociosos reaproveitados)
  if (payload.agentPhaseConfig) {
    const phaseFields = buildPhaseConfigFields(
      payload.agentPhaseConfig as AgentPhaseConfig,
    );
    Object.assign(data, phaseFields);
  }

  return data;
};

/**
 * Converte AgentPhaseConfig em campos Baserow (reaproveitando campos stages ociosos).
 * Usado pela pagina /configuracoes/agente e pelo wizard step.
 */
export const buildPhaseConfigFields = (
  config: AgentPhaseConfig,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  // Prompts customizados por fase (campos stages ociosos)
  data["body.agentSettings.stages.0.script"] =
    config.phases.initial.customPrompt || "";
  data["body.agentSettings.stages.1.script"] =
    config.phases.questions.customPrompt || "";
  data["body.agentSettings.stages.2.script"] =
    config.phases.finalization.customPrompt || "";

  // Regras de qualificacao
  data["body.agentSettings.flow.qualificationPrompt"] =
    config.qualificationRules || "";
  data["body.agentSettings.flow.qualificationFallback"] =
    config.disqualificationMessage || "";

  // Funcionalidades ativas na etapa final (JSON)
  data["body.agentSettings.flow.commitmentScript"] = JSON.stringify(
    config.finalizationFeatures,
  );

  return data;
};

/**
 * Le AgentPhaseConfig a partir de uma row Baserow (campos com dot notation).
 */
export const readPhaseConfigFromRow = (
  row: Record<string, unknown>,
): AgentPhaseConfig => {
  let finalizationFeatures = { agendamento: true, assinatura_documentos: false, acompanhamento_processual: false };
  try {
    const raw = row["body.agentSettings.flow.commitmentScript"];
    if (typeof raw === "string" && raw.trim().startsWith("{")) {
      finalizationFeatures = { ...finalizationFeatures, ...JSON.parse(raw) };
    }
  } catch {
    // fallback para defaults
  }

  return {
    phases: {
      initial: {
        customPrompt:
          typeof row["body.agentSettings.stages.0.script"] === "string"
            ? row["body.agentSettings.stages.0.script"]
            : "",
      },
      questions: {
        customPrompt:
          typeof row["body.agentSettings.stages.1.script"] === "string"
            ? row["body.agentSettings.stages.1.script"]
            : "",
      },
      finalization: {
        customPrompt:
          typeof row["body.agentSettings.stages.2.script"] === "string"
            ? row["body.agentSettings.stages.2.script"]
            : "",
      },
    },
    qualificationRules:
      typeof row["body.agentSettings.flow.qualificationPrompt"] === "string"
        ? row["body.agentSettings.flow.qualificationPrompt"]
        : "",
    disqualificationMessage:
      typeof row["body.agentSettings.flow.qualificationFallback"] === "string"
        ? row["body.agentSettings.flow.qualificationFallback"]
        : "",
    finalizationFeatures,
  };
};

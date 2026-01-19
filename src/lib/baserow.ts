import type { OnboardingPayload } from "@/lib/validations";

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

  const address = tenant.address ?? {
    street: "",
    city: "",
    state: "",
    zipCode: "",
  };
  data["body.tenant.address.street"] = ensureString(address.street);
  data["body.tenant.address.city"] = ensureString(address.city);
  data["body.tenant.address.state"] = ensureString(address.state);
  data["body.tenant.address.zipCode"] = ensureString(address.zipCode);

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

  return data;
};

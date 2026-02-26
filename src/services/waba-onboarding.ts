/**
 * WhatsApp Business Onboarding — OAuth flow
 *
 * Substitui o webhook N8N (wa/auth) por implementação direta.
 * Fluxo: code → access_token → debug_token → phone_numbers → subscribe → update config
 */
import axios from "axios";
import { getBaserowConfigs, updateBaserowConfig } from "@/services/api";

const GRAPH_API_VERSION = process.env.WABA_GRAPH_API_VERSION ?? "v22.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const WABA_ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN ?? "";
const WHATSAPP_CLIENT_ID =
  process.env.NEXT_PUBLIC_WHATSAPP_CLIENT_ID ?? "";
const WHATSAPP_CLIENT_SECRET = process.env.WHATSAPP_CLIENT_SECRET ?? "";
const WHATSAPP_REDIRECT_URI =
  process.env.NEXT_PUBLIC_WHATSAPP_REDIRECT_URI ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
};

type DebugTokenResponse = {
  data: {
    app_id: string;
    is_valid: boolean;
    granular_scopes: Array<{
      scope: string;
      target_ids: string[];
    }>;
  };
};

type PhoneNumbersResponse = {
  data: Array<{
    id: string;
    display_phone_number: string;
    verified_name?: string;
    quality_rating?: string;
    name_status?: string;
    certificate?: string;
    new_certificate?: string;
    new_name_status?: string;
  }>;
};

export type OnboardingResult = {
  success: boolean;
  phoneNumber?: string;
  wabaPhoneId?: string;
  wabaBusinessAccountId?: string;
  error?: string;
  step?: string;
};

// ---------------------------------------------------------------------------
// Step 1: Exchange code for access_token
// ---------------------------------------------------------------------------

async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await axios.get<OAuthTokenResponse>(
    `${GRAPH_BASE_URL}/oauth/access_token`,
    {
      params: {
        client_id: WHATSAPP_CLIENT_ID,
        client_secret: WHATSAPP_CLIENT_SECRET,
        redirect_uri: WHATSAPP_REDIRECT_URI,
        code,
      },
      timeout: 15_000,
    },
  );
  if (!response.data.access_token) {
    throw new Error("access_token ausente na resposta do Facebook");
  }
  return response.data.access_token;
}

// ---------------------------------------------------------------------------
// Step 2: Debug token → extract WABA IDs
// ---------------------------------------------------------------------------

async function debugTokenRequest(inputToken: string): Promise<{
  wabaBusinessId: string;
  phoneContainerWabaId: string;
}> {
  if (!WABA_ACCESS_TOKEN) {
    throw new Error("WABA_ACCESS_TOKEN não configurado no servidor");
  }

  const response = await axios.get<DebugTokenResponse>(
    `${GRAPH_BASE_URL}/debug_token`,
    {
      params: { input_token: inputToken },
      headers: { Authorization: `Bearer ${WABA_ACCESS_TOKEN}` },
      timeout: 15_000,
    },
  );

  const scopes = response.data.data?.granular_scopes;
  if (!scopes?.length) {
    throw new Error("Nenhum escopo encontrado no debug_token");
  }

  // scopes[0].target_ids[0] = WABA Business Account ID (para subscribe + templates)
  // scopes[1].target_ids[1] = Phone container WABA ID (para buscar phone_numbers)
  const wabaBusinessId = scopes[0]?.target_ids?.[0];
  const phoneContainerWabaId =
    scopes[1]?.target_ids?.[1] ??
    scopes[1]?.target_ids?.[0] ??
    scopes[0]?.target_ids?.[0];

  if (!wabaBusinessId) {
    throw new Error(
      "Não foi possível extrair WABA Business ID do debug_token",
    );
  }
  if (!phoneContainerWabaId) {
    throw new Error(
      "Não foi possível extrair Phone Container WABA ID do debug_token",
    );
  }

  return { wabaBusinessId, phoneContainerWabaId };
}

// ---------------------------------------------------------------------------
// Step 3: Get phone numbers from WABA
// ---------------------------------------------------------------------------

async function getPhoneNumbers(wabaId: string): Promise<{
  phoneNumberId: string;
  displayPhoneNumber: string;
}> {
  if (!WABA_ACCESS_TOKEN) {
    throw new Error("WABA_ACCESS_TOKEN não configurado no servidor");
  }

  const response = await axios.get<PhoneNumbersResponse>(
    `${GRAPH_BASE_URL}/${wabaId}/phone_numbers`,
    {
      params: {
        fields:
          "id,display_phone_number,verified_name,quality_rating,name_status,certificate,new_certificate,new_name_status",
      },
      headers: { Authorization: `Bearer ${WABA_ACCESS_TOKEN}` },
      timeout: 15_000,
    },
  );

  const phone = response.data.data?.[0];
  if (!phone) {
    throw new Error("Nenhum número de telefone encontrado na conta WABA");
  }

  return {
    phoneNumberId: phone.id,
    displayPhoneNumber: phone.display_phone_number,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Subscribe WABA to app webhook events
// ---------------------------------------------------------------------------

const SUBSCRIBED_FIELDS = [
  "account_alerts",
  "account_review_update",
  "account_update",
  "business_capability_update",
  "message_template_quality_update",
  "message_template_status_update",
  "message_template_components_update",
  "messages",
  "phone_number_name_update",
  "phone_number_quality_update",
  "security",
  "template_category_update",
  "flows",
  "smb_message_echoes",
].join(",");

async function subscribeApp(businessId: string): Promise<void> {
  if (!WABA_ACCESS_TOKEN) {
    throw new Error("WABA_ACCESS_TOKEN não configurado no servidor");
  }

  await axios.post(
    `${GRAPH_BASE_URL}/${businessId}/subscribed_apps`,
    { subscribed_fields: SUBSCRIBED_FIELDS },
    {
      headers: {
        Authorization: `Bearer ${WABA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
    },
  );
}

// ---------------------------------------------------------------------------
// Step 5: Find config row and update with WABA IDs
// ---------------------------------------------------------------------------

async function findAndUpdateConfig(
  institutionId: number,
  displayPhoneNumber: string,
  phoneNumberId: string,
  wabaBusinessAccountId: string,
): Promise<void> {
  const configs = await getBaserowConfigs(institutionId);

  // Buscar config que contenha o phone number
  const normalizedDisplay = displayPhoneNumber.replace(/\D/g, "");
  let targetConfig = configs.find((c) => {
    const record = c as Record<string, unknown>;
    const phone = String(record["waba_phone_number"] ?? "")
      .replace(/\D/g, "")
      .trim();
    return phone && normalizedDisplay.includes(phone);
  });

  // Fallback: usar a config mais recente da instituição
  if (!targetConfig && configs.length > 0) {
    targetConfig = configs.reduce(
      (latest, c) => (c.id > latest.id ? c : latest),
      configs[0],
    );
  }

  if (!targetConfig) {
    throw new Error(
      `Nenhuma configuração encontrada para a instituição ${institutionId}`,
    );
  }

  await updateBaserowConfig(targetConfig.id, {
    waba_phone_id: phoneNumberId,
    waba_business_account_id: wabaBusinessAccountId,
  } as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function processWhatsAppOnboarding(
  code: string,
  institutionId: number,
): Promise<OnboardingResult> {
  try {
    // Step 1: Exchange code for token
    console.log("[waba-onboarding] Step 1: Trocando code por access_token...");
    const accessToken = await exchangeCodeForToken(code);

    // Step 2: Debug token to get WABA IDs
    console.log("[waba-onboarding] Step 2: Debug token...");
    const { wabaBusinessId, phoneContainerWabaId } =
      await debugTokenRequest(accessToken);
    console.log(
      `[waba-onboarding] WABA Business ID: ${wabaBusinessId}, Phone Container: ${phoneContainerWabaId}`,
    );

    // Step 3: Get phone numbers
    console.log("[waba-onboarding] Step 3: Buscando phone numbers...");
    const { phoneNumberId, displayPhoneNumber } =
      await getPhoneNumbers(phoneContainerWabaId);
    console.log(
      `[waba-onboarding] Phone: ${displayPhoneNumber} (ID: ${phoneNumberId})`,
    );

    // Step 4: Subscribe app
    console.log("[waba-onboarding] Step 4: Inscrevendo app no WABA...");
    await subscribeApp(wabaBusinessId);

    // Step 5: Update config
    console.log("[waba-onboarding] Step 5: Atualizando configuração...");
    await findAndUpdateConfig(
      institutionId,
      displayPhoneNumber,
      phoneNumberId,
      wabaBusinessId,
    );

    console.log("[waba-onboarding] Fluxo concluído com sucesso!");
    return {
      success: true,
      phoneNumber: displayPhoneNumber,
      wabaPhoneId: phoneNumberId,
      wabaBusinessAccountId: wabaBusinessId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    const axiosData = axios.isAxiosError(error)
      ? error.response?.data
      : undefined;
    console.error("[waba-onboarding] Falha:", message, axiosData ?? "");

    return {
      success: false,
      error: message,
      step: identifyFailedStep(error),
    };
  }
}

function identifyFailedStep(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("access_token") || msg.includes("oauth")) return "exchange_token";
  if (msg.includes("debug_token") || msg.includes("WABA Business ID") || msg.includes("escopo"))
    return "debug_token";
  if (msg.includes("phone") || msg.includes("telefone") || msg.includes("número"))
    return "get_phone_numbers";
  if (msg.includes("subscri")) return "subscribe_app";
  if (msg.includes("config") || msg.includes("instituição"))
    return "update_config";
  return "unknown";
}

import axios from "axios";
import { eq, and, asc, desc, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { prepared } from "@/lib/db/prepared";
import { kanbanColumns as kcTable } from "@/lib/db/schema/kanbanColumns";
import { caseKanbanStatus as cksTable } from "@/lib/db/schema/caseKanbanStatus";
import { webhooks as whTable } from "@/lib/db/schema/webhooks";
import { followUpConfig as fucTable } from "@/lib/db/schema/followUpConfig";
import { followUpHistory as fuhTable } from "@/lib/db/schema/followUpHistory";
import { cases as casesTable } from "@/lib/db/schema/cases";
import { config as cfgTable } from "@/lib/db/schema/config";
import { events as eventsTable } from "@/lib/db/schema/events";
import { eventGuests as eventGuestsTable } from "@/lib/db/schema/eventGuests";
import { clients as clientsTable } from "@/lib/db/schema/clients";
import { useDirectDb, tryDrizzle } from "@/lib/db/repository";

import type {
  AuthInfo,
  LoginCredentials,
  OnboardingPayload,
} from "@/lib/validations";

const API_URL =
  process.env.NEXT_PUBLIC_ONBOARDING_API_URL || "/api/onboarding";
const LOGIN_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_LOGIN_WEBHOOK_URL ||
  "https://automation-webhook.riasistemas.com.br/webhook/login-v2";

export const submitOnboarding = async (payload: OnboardingPayload) => {
  try {
    const response = await axios.post(
      API_URL,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000, // 60 segundos de timeout
      },
    );
    return response;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // O servidor respondeu com um status de erro
        const errorMessage = error.response.data?.message || error.message || "Erro ao enviar dados";
        throw new Error(errorMessage);
      } else if (error.request) {
        // A requisiÃ§Ã£o foi feita mas nÃ£o houve resposta
        throw new Error("NÃ£o foi possÃ­vel conectar ao servidor. Verifique sua conexÃ£o.");
      } else {
        // Algo aconteceu ao configurar a requisiÃ§Ã£o
        throw new Error(error.message || "Erro ao configurar a requisiÃ§Ã£o");
      }
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao enviar dados");
  }
};

type LoginWebhookItem = {
  code?: string;
  message?: string;
  result?: {
    type?: string;
    token?: string;
    expires_at?: string;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const normalizeLoginItem = (value: unknown): LoginWebhookItem | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as LoginWebhookItem;
};

const getLoginResult = (data: unknown): LoginWebhookItem | null => {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return getLoginResult(parsed);
    } catch {
      return null;
    }
  }

  if (Array.isArray(data)) {
    for (const entry of data) {
      const candidate = normalizeLoginItem(entry);
      if (!candidate?.code) continue;
      const normalizedCode =
        typeof candidate.code === "string"
          ? candidate.code.trim().toUpperCase()
          : "";

      if (normalizedCode === "LOGIN_SUCCESS") {
        return candidate;
      }
    }

    return normalizeLoginItem(data[0]);
  }

  if (typeof data === "object") {
    if ("data" in (data as Record<string, unknown>)) {
      return getLoginResult((data as Record<string, unknown>).data);
    }
    return normalizeLoginItem(data);
  }

  return null;
};

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

const extractInstitutionId = (item: LoginWebhookItem): number | null => {
  const candidates = [
    item.result?.payload?.institution_id,
    item.result?.payload?.institutionId,
    item.result?.payload?.id,
    item.result?.institution_id,
    item.result?.institutionId,
    item.result?.id,
    item.institution_id,
    item.institutionId,
    item.id,
    (item as Record<string, unknown>).myField,
  ];

  for (const candidate of candidates) {
    const parsed = asNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isArrayBufferValue = (value: unknown): value is ArrayBuffer =>
  typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;

const isArrayBufferViewValue = (value: unknown): value is ArrayBufferView =>
  typeof ArrayBuffer !== "undefined" &&
  typeof ArrayBuffer.isView === "function" &&
  ArrayBuffer.isView(value);

const decodeArrayBufferValue = (
  value: ArrayBuffer | ArrayBufferView,
): string | null => {
  try {
    if (typeof TextDecoder === "undefined") {
      return null;
    }
    const decoder = new TextDecoder();
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return decoder.decode(bytes);
  } catch {
    return null;
  }
};

const normalizeUnknownResponseData = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (isArrayBufferValue(value) || isArrayBufferViewValue(value)) {
    const decoded = decodeArrayBufferValue(value);
    if (decoded !== null) {
      return decoded;
    }
    const size =
      value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
    const typeName =
      value instanceof ArrayBuffer
        ? "ArrayBuffer"
        : value.constructor?.name ?? "ArrayBufferView";
    return `${typeName}(${size})`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  return value;
};

const snapshotValueForLog = (value: unknown): unknown => {
  const normalizedValue = normalizeUnknownResponseData(value);

  if (
    normalizedValue === null ||
    normalizedValue === undefined ||
    typeof normalizedValue === "string" ||
    typeof normalizedValue === "number" ||
    typeof normalizedValue === "boolean"
  ) {
    return normalizedValue;
  }

  if (isRecordObject(normalizedValue)) {
    if (typeof normalizedValue.toJSON === "function") {
      try {
        return normalizedValue.toJSON();
      } catch {
        // ignore and fallback to JSON.stringify
      }
    }
  }

  try {
    return JSON.parse(JSON.stringify(normalizedValue));
  } catch (error) {
    const typeName =
      normalizedValue &&
      typeof normalizedValue === "object" &&
      "constructor" in normalizedValue &&
      typeof normalizedValue.constructor === "function"
        ? normalizedValue.constructor.name
        : typeof normalizedValue;
    return {
      type: typeName,
      serializationError:
        error instanceof Error ? error.message : "Unknown serialization error",
    };
  }
};

const stringifyUnknownValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return error instanceof Error
      ? `<<Nao foi possivel serializar os dados (${error.message})>>`
      : "<<Nao foi possivel serializar os dados>>";
  }
};

export const authenticate = async (
  credentials: LoginCredentials,
): Promise<AuthInfo> => {
  try {
    const response = await axios.post(LOGIN_WEBHOOK_URL, credentials, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
      validateStatus: (status) => status < 500, // Não lançar erro para 4xx
    });

    // Verificar se a resposta é válida
    if (!response.data) {
      throw new Error("Resposta vazia do servico de login");
    }

    const loginResult = getLoginResult(response.data);
    if (!loginResult) {
      console.error("Resposta inválida do login:", response.data);
      throw new Error("Resposta invalida do servico de login");
    }

    const normalizedCode =
      typeof loginResult.code === "string"
        ? loginResult.code.trim().toUpperCase()
        : "";

    if (normalizedCode !== "LOGIN_SUCCESS") {
      throw new Error(loginResult.message || "Credenciais invalidas");
    }

    const institutionId = extractInstitutionId(loginResult);

    if (typeof institutionId !== "number" || !Number.isFinite(institutionId)) {
      throw new Error("Instituicao nao retornou um identificador valido");
    }

    let payload: Record<string, unknown> | undefined = loginResult.result?.payload;
    if (!payload && isRecordObject(loginResult)) {
      const candidate = (loginResult as Record<string, unknown>).payload;
      if (isRecordObject(candidate)) {
        payload = candidate;
      } else {
        payload = loginResult;
      }
    }

    return {
      institutionId,
      token: loginResult.result?.token ?? (loginResult as Record<string, unknown>).token as string | undefined,
      expiresAt: loginResult.result?.expires_at ?? (loginResult as Record<string, unknown>).expires_at as string | undefined,
      payload,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Verificar se a resposta é texto HTML ou não-JSON
        const contentType = error.response.headers["content-type"] || "";
        let errorMessage = error.message || "Erro ao autenticar usuario";
        
        if (!contentType.includes("application/json")) {
          const responseText = typeof error.response.data === "string" 
            ? error.response.data 
            : String(error.response.data);
          
          if (responseText.includes("Bad Gateway") || responseText.includes("Gateway")) {
            errorMessage = "Serviço de autenticação temporariamente indisponível. Tente novamente em alguns instantes.";
          } else {
            errorMessage = `Erro do servidor: ${responseText.substring(0, 100)}`;
          }
        } else {
          errorMessage = error.response.data?.message || errorMessage;
        }
        
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Nao foi possivel conectar ao servico de login. Verifique sua conexao.");
      }
      throw new Error(error.message || "Erro ao configurar a requisicao de login");
    }

    throw new Error(error instanceof Error ? error.message : "Erro inesperado ao autenticar");
  }
};

export type SyncUserAccountPayload = {
  institutionId: number;
  legacyUserId: string;
  email?: string;
  name?: string;
  password?: string;
  isActive?: boolean;
};

export const syncUserAccount = async (
  payload: SyncUserAccountPayload,
): Promise<void> => {
  await axios.post("/api/v1/auth/sync-user", payload, {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
};

const CONFIG_API_URL = "/api/config";

export const getConfig = async (institutionId: number) => {
  try {
    const response = await axios.get(
      `${CONFIG_API_URL}/${institutionId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return null; // ConfiguraÃ§Ã£o nÃ£o encontrada
      }
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar configuraÃ§Ã£o";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("NÃ£o foi possÃ­vel conectar ao servidor");
      }
      throw new Error(error.message || "Erro ao configurar a requisiÃ§Ã£o");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateConfig = async (
  institutionId: number,
  payload: OnboardingPayload,
) => {
  try {
    const response = await axios.put(
      `${CONFIG_API_URL}/${institutionId}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000,
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const headers = error.response.headers;
        const rawData = error.response.data;
        const normalizedData = snapshotValueForLog(rawData);
        const hasData =
          normalizedData !== undefined &&
          normalizedData !== null &&
          (typeof normalizedData === "string"
            ? normalizedData.trim().length > 0
            : typeof normalizedData === "object"
              ? Object.keys(normalizedData).length > 0
              : true);
        const serializedData = stringifyUnknownValue(normalizedData);

        console.error("Erro detalhado da API:", {
          status,
          statusText,
          hasData,
          rawDataType:
            rawData === null
              ? "null"
              : rawData === undefined
                ? "undefined"
                : rawData?.constructor?.name ?? typeof rawData,
          normalizedType:
            normalizedData === null
              ? "null"
              : typeof normalizedData === "object"
                ? normalizedData?.constructor?.name ?? "object"
                : typeof normalizedData,
          data: normalizedData,
          dataStringified: serializedData,
          headers: headers ? Object.fromEntries(Object.entries(headers)) : null,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data,
          },
        });

        // Tentar extrair mensagem de erro mais detalhada
        let errorMessage = `Erro ao atualizar configuracao (${status} ${statusText})`;

        if (hasData) {
          if (typeof normalizedData === "string") {
            errorMessage = normalizedData || errorMessage;
          } else if (isRecordObject(normalizedData)) {
            if (normalizedData.message) {
              errorMessage = String(normalizedData.message);
            } else if (normalizedData.error) {
              errorMessage = String(normalizedData.error);
            } else if (normalizedData.details) {
              // Se houver detalhes de validacao, format-los
              const details = normalizedData.details;
              if (isRecordObject(details)) {
                const fieldErrors = (details.fieldErrors ??
                  {}) as Record<string, unknown>;
                const formErrors = Array.isArray(details.formErrors)
                  ? details.formErrors
                  : [];
                const fieldMessages = Object.entries(fieldErrors).map(
                  ([field, errors]) =>
                    `${field}: ${
                      Array.isArray(errors) ? errors.join(", ") : errors
                    }`,
                );
                const allMessages = [...fieldMessages, ...formErrors]
                  .filter(Boolean)
                  .join("\n");
                errorMessage = `Erro de validacao:\n${
                  allMessages || "Dados invalidos"
                }`;
              } else {
                errorMessage = String(details);
              }
            } else if (Object.keys(normalizedData).length > 0) {
              // Se o objeto nao tiver campos conhecidos, mostrar o JSON
              errorMessage = `Erro ${status}: ${serializedData}`;
            } else {
              errorMessage = `Erro ${status} ${statusText}: Objeto de erro vazio`;
            }
          } else {
            errorMessage = serializedData || errorMessage;
          }
        } else {
          errorMessage = `Erro ${status} ${statusText}: Resposta vazia do servidor. Verifique os logs do servidor para mais detalhes.`;
        }

        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("NÃ£o foi possÃ­vel conectar ao servidor");
      }
      throw new Error(error.message || "Erro ao configurar a requisiÃ§Ã£o");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

// Baserow API configuration - usando variáveis de ambiente
const BASEROW_API_URL =
  process.env.NEXT_PUBLIC_BASEROW_API_URL ||
  process.env.BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "";
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ||
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ||
  process.env.AUTOMATION_DB_TOKEN ||
  "";
const BASEROW_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CONFIG_TABLE_ID ||
      process.env.BASEROW_CONFIG_TABLE_ID,
  ) || 224;

// Validação de configuração (apenas em desenvolvimento para debug)
if (
  process.env.NODE_ENV !== "production" &&
  typeof window === "undefined" &&
  (!BASEROW_API_URL || !BASEROW_API_KEY)
) {
  console.error("AVISO: Configuração do Baserow incompleta. Verifique as variáveis de ambiente.");
}

// ---------------------------------------------------------------------------
// Baserow HTTP helpers — keeps API key server-side
// Server: direct axios (preserves AxiosError for existing catch blocks)
// Client: routes through /api/v1/baserow-proxy
// ---------------------------------------------------------------------------

const _isServer = typeof window === "undefined";

class BaserowHttpError extends Error {
  status: number;
  responseData: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "BaserowHttpError";
    this.status = status;
    this.responseData = data;
  }
}

const _baserowHeaders = () => ({
  Authorization: `Token ${BASEROW_API_KEY}`,
  "Content-Type": "application/json" as const,
});

async function _proxyFetch(url: string, method: string, data?: unknown): Promise<Response> {
  return fetch("/api/v1/baserow-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, ...(data !== undefined ? { data } : {}) }),
  });
}

async function _handleProxyResponse<T>(resp: Response): Promise<{ data: T; status: number }> {
  const body = resp.status !== 204 ? await resp.json().catch(() => ({})) : {};
  if (!resp.ok) {
    throw new BaserowHttpError(
      (body as Record<string, string>).error || `Erro Baserow: ${resp.status}`,
      resp.status,
      body,
    );
  }
  return { data: body as T, status: resp.status };
}

export async function baserowGet<T = unknown>(url: string, timeout = 30000): Promise<{ data: T; status: number }> {
  if (_isServer) {
    return axios.get<T>(url, { headers: _baserowHeaders(), timeout });
  }
  return _handleProxyResponse<T>(await _proxyFetch(url, "GET"));
}

export async function baserowPost<T = unknown>(url: string, body: unknown, timeout = 30000): Promise<{ data: T; status: number }> {
  if (_isServer) {
    return axios.post<T>(url, body, { headers: _baserowHeaders(), timeout });
  }
  return _handleProxyResponse<T>(await _proxyFetch(url, "POST", body));
}

export async function baserowPatch<T = unknown>(url: string, body: unknown, timeout = 30000): Promise<{ data: T; status: number }> {
  if (_isServer) {
    return axios.patch<T>(url, body, { headers: _baserowHeaders(), timeout });
  }
  return _handleProxyResponse<T>(await _proxyFetch(url, "PATCH", body));
}

export async function baserowDelete(url: string, timeout = 30000): Promise<void> {
  if (_isServer) {
    await axios.delete(url, { headers: _baserowHeaders(), timeout });
    return;
  }
  const resp = await _proxyFetch(url, "DELETE");
  if (!resp.ok && resp.status !== 204) {
    const body = await resp.json().catch(() => ({}));
    throw new BaserowHttpError(
      (body as Record<string, string>).error || `Erro Baserow: ${resp.status}`,
      resp.status,
      body,
    );
  }
}

export type BaserowConfigRow = {
  id: number;
  [key: string]: unknown;
};

type BaserowListResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

/* ──────────────────────────── Config helpers (Drizzle) ──────────────────────────── */

/** Bidirectional mapping: Baserow user_field_name → Drizzle column key */
const CONFIG_FIELD_MAP: Record<string, keyof typeof cfgTable.$inferInsert> = {
  "body.auth.institutionId": "bodyAuthInstitutionId",
  "body.tenant.companyName": "bodyTenantCompanyName",
  "body.tenant.businessHours": "bodyTenantBusinessHours",
  "body.tenant.address.street": "bodyTenantAddressStreet",
  "body.tenant.address.city": "bodyTenantAddressCity",
  "body.tenant.address.state": "bodyTenantAddressState",
  "body.tenant.address.zipCode": "bodyTenantAddressZipCode",
  "body.agentSettings.profile.agentName": "bodyAgentSettingsProfileAgentName",
  "body.agentSettings.profile.language": "bodyAgentSettingsProfileLanguage",
  "body.agentSettings.profile.personalityDescription": "bodyAgentSettingsProfilePersonalityDescription",
  "body.agentSettings.profile.expertiseArea": "bodyAgentSettingsProfileExpertiseArea",
  "body.agentSettings.personality.greeting": "bodyAgentSettingsPersonalityGreeting",
  "body.agentSettings.personality.closing": "bodyAgentSettingsPersonalityClosing",
  "body.agentSettings.personality.forbiddenWords.0": "bodyAgentSettingsPersonalityForbiddenWords_0",
  "perguntas": "perguntas",
  "quanditadePerguntas": "quanditadePerguntas",
  "body.agentSettings.stages.0.mission": "bodyAgentSettingsStages_0Mission",
  "body.agentSettings.stages.0.script": "bodyAgentSettingsStages_0Script",
  "body.agentSettings.stages.1.stage": "bodyAgentSettingsStages_1Stage",
  "body.agentSettings.stages.1.agent": "bodyAgentSettingsStages_1Agent",
  "body.agentSettings.stages.1.mission": "bodyAgentSettingsStages_1Mission",
  "body.agentSettings.stages.1.script": "bodyAgentSettingsStages_1Script",
  "body.agentSettings.stages.2.stage": "bodyAgentSettingsStages_2Stage",
  "body.agentSettings.stages.2.agent": "bodyAgentSettingsStages_2Agent",
  "body.agentSettings.stages.2.mission": "bodyAgentSettingsStages_2Mission",
  "body.agentSettings.stages.2.script": "bodyAgentSettingsStages_2Script",
  "body.agentSettings.stages.3.stage": "bodyAgentSettingsStages_3Stage",
  "body.agentSettings.stages.3.agent": "bodyAgentSettingsStages_3Agent",
  "body.agentSettings.stages.3.mission": "bodyAgentSettingsStages_3Mission",
  "body.agentSettings.stages.3.script": "bodyAgentSettingsStages_3Script",
  "body.agentSettings.flow.greetingsScript": "bodyAgentSettingsFlowGreetingsScript",
  "body.agentSettings.flow.companyOfferings": "bodyAgentSettingsFlowCompanyOfferings",
  "body.agentSettings.flow.qualificationPrompt": "bodyAgentSettingsFlowQualificationPrompt",
  "body.agentSettings.flow.qualificationFallback": "bodyAgentSettingsFlowQualificationFallback",
  "body.agentSettings.flow.viabilityQuestions.0.prompt": "bodyAgentSettingsFlowViabilityQuestions_0Prompt",
  "body.agentSettings.flow.viabilityQuestions.0.objective": "bodyAgentSettingsFlowViabilityQuestions_0Objective",
  "body.agentSettings.flow.viabilityQuestions.1.prompt": "bodyAgentSettingsFlowViabilityQuestions_1Prompt",
  "body.agentSettings.flow.viabilityQuestions.1.objective": "bodyAgentSettingsFlowViabilityQuestions_1Objective",
  "body.agentSettings.flow.disqualificationRules": "bodyAgentSettingsFlowDisqualificationRules",
  "body.agentSettings.flow.commitmentType": "bodyAgentSettingsFlowCommitmentType",
  "body.agentSettings.flow.commitmentScript": "bodyAgentSettingsFlowCommitmentScript",
  "body.agentSettings.flow.documentsChecklist.0": "bodyAgentSettingsFlowDocumentsChecklist_0",
  "body.agentSettings.flow.documentsChecklist.1": "bodyAgentSettingsFlowDocumentsChecklist_1",
  "body.agentSettings.flow.documentsChecklist.2": "bodyAgentSettingsFlowDocumentsChecklist_2",
  "body.agentSettings.flow.documentConfirmationMessage": "bodyAgentSettingsFlowDocumentConfirmationMessage",
  "body.agentSettings.flow.closingMessage": "bodyAgentSettingsFlowClosingMessage",
  "body.agentSettings.flow.followUpRules": "bodyAgentSettingsFlowFollowUpRules",
  "waba_phone_number": "wabaPhoneNumber",
  "ia_ativada": "iaAtivada",
  "waba_phone_id": "wabaPhoneId",
  "phone_department_id": "phoneDepartmentId",
  "phone_department_name": "phoneDepartmentName",
  "waba_business_account_id": "wabaBusinessAccountId",
  "queue_mode": "queueMode",
  "riasign_waba_config_id": "riasignWabaConfigId",
};

/** Reverse map: Drizzle column key → Baserow field name */
const CONFIG_DRIZZLE_TO_BASEROW: Record<string, string> = Object.fromEntries(
  Object.entries(CONFIG_FIELD_MAP).map(([br, dz]) => [dz, br]),
);

/** Convert a Drizzle config row to BaserowConfigRow (user_field_names format) */
function mapConfigRow(row: typeof cfgTable.$inferSelect): BaserowConfigRow {
  const result: BaserowConfigRow = { id: row.id };
  for (const [drizzleKey, baserowName] of Object.entries(CONFIG_DRIZZLE_TO_BASEROW)) {
    const val = (row as Record<string, unknown>)[drizzleKey];
    result[baserowName] = val ?? null;
  }
  return result;
}

/** Convert BaserowConfigRow data (user_field_names) → Drizzle set object */
function buildConfigSetObj(data: Record<string, unknown>): Record<string, unknown> {
  const setObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "id") continue;
    const drizzleKey = CONFIG_FIELD_MAP[key];
    if (drizzleKey) {
      // queueMode is jsonb — pass as-is; all others become strings
      if (drizzleKey === "queueMode") {
        setObj[drizzleKey] = value ?? null;
      } else {
        setObj[drizzleKey] = value != null ? String(value) : null;
      }
    }
  }
  return setObj;
}

/* ──────────────────────────── Config functions ──────────────────────────── */

export const getBaserowConfigs = async (institutionId?: number): Promise<BaserowConfigRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const shouldFilter = typeof institutionId === "number" && institutionId !== 4;
      const rows = shouldFilter
        ? await db.select().from(cfgTable).where(eq(cfgTable.bodyAuthInstitutionId, String(institutionId)))
        : await db.select().from(cfgTable);
      return rows.map(mapConfigRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`;

    const response = await baserowGet(url);

    let results = (response.data as { results?: BaserowConfigRow[] }).results || [];

    // Filtrar pelo body.auth.institutionId se fornecido
    // O Baserow retorna campos com nomes como "body.auth.institutionId" (string literal)
    const shouldFilterByInstitution =
      typeof institutionId === "number" && institutionId !== 4 && results.length > 0;

    if (shouldFilterByInstitution) {
      results = results.filter((row: BaserowConfigRow) => {
        const rowData = row as Record<string, unknown>;
        const rowInstitutionId = rowData["body.auth.institutionId"];

        // Comparar o institutionId (pode ser string ou número)
        return rowInstitutionId === institutionId ||
               Number(rowInstitutionId) === institutionId ||
               String(rowInstitutionId) === String(institutionId);
      });
    }

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar configurações do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao buscar configurações");
  }
};

export const updateBaserowConfig = async (
  rowId: number,
  data: Partial<BaserowConfigRow>,
): Promise<BaserowConfigRow> => {
  // fullAddress é campo virtual (sintetizado na UI a partir de street/city/state/zipCode).
  // Não existe na tabela — remapear para street e limpar os demais.
  if ("body.tenant.address.fullAddress" in data) {
    const fullAddr = data["body.tenant.address.fullAddress"];
    // Garantir que street seja string (nunca undefined) — JSON.stringify omite undefined
    data["body.tenant.address.street"] = fullAddr != null ? String(fullAddr) : "";
    data["body.tenant.address.city"] = "";
    data["body.tenant.address.state"] = "";
    data["body.tenant.address.zipCode"] = "";
    delete data["body.tenant.address.fullAddress"];
  }

  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj = buildConfigSetObj(data as Record<string, unknown>);
      const [row] = await db
        .update(cfgTable)
        .set(setObj)
        .where(eq(cfgTable.id, rowId))
        .returning();
      if (!row) throw new Error(`Config row ${rowId} not found`);
      return mapConfigRow(row);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/${rowId}/?user_field_names=true`;

    const response = await baserowPatch(url, data);

    return response.data as BaserowConfigRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar configuração do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao atualizar configuração");
  }
};

export const updateIaAtivada = async (
  institutionId: number,
  iaAtivada: "sim" | "não",
): Promise<BaserowConfigRow> => {
  try {
    const configs = await getBaserowConfigs(institutionId);

    if (!configs.length) {
      throw new Error("Nenhuma configuração encontrada para o institutionId");
    }

    // Pegar a linha mais recente (maior ID)
    const latestRow = configs.reduce(
      (current, candidate) => (candidate.id > current.id ? candidate : current),
      configs[0],
    );

    // Atualizar o campo ia_ativada
    const updatedRow = await updateBaserowConfig(latestRow.id, {
      ia_ativada: iaAtivada,
    });

    return updatedRow;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Erro desconhecido ao atualizar ia_ativada");
  }
};

export const createBaserowConfig = async (
  data: Partial<BaserowConfigRow>,
): Promise<BaserowConfigRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const insertObj = buildConfigSetObj(data as Record<string, unknown>);
      const [row] = await db
        .insert(cfgTable)
        .values(insertObj as typeof cfgTable.$inferInsert)
        .returning();
      return mapConfigRow(row);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`;

    const response = await baserowPost(url, data);

    return response.data as BaserowConfigRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar configuração no Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao criar configuração");
  }
};

const BASEROW_AGENT_STATE_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_AGENT_STATE_TABLE_ID ||
      process.env.BASEROW_AGENT_STATE_TABLE_ID,
  ) || 226;
const BASEROW_AGENT_STATE_NUMBER_FIELD_ID = 1695;
const BASEROW_CASES_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID ||
      process.env.BASEROW_CASES_TABLE_ID,
  ) || 225;
const DEFAULT_BASEROW_EVENTS_TABLE_ID = 234;
const DEFAULT_BASEROW_EVENT_GUESTS_TABLE_ID = 235;
const BASEROW_EVENTS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_EVENTS_TABLE_ID ||
      process.env.BASEROW_EVENTS_TABLE_ID,
  ) || DEFAULT_BASEROW_EVENTS_TABLE_ID;
const BASEROW_EVENT_GUESTS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_EVENT_GUESTS_TABLE_ID ||
      process.env.BASEROW_EVENT_GUESTS_TABLE_ID,
  ) || DEFAULT_BASEROW_EVENT_GUESTS_TABLE_ID;

export type AgentStateRow = {
  id: number;
  numero?: string;
  estado?: string;
  [key: string]: unknown;
};

const buildAgentStateUrl = (phoneNumber?: string) => {
  const baseUrl = `${BASEROW_API_URL}/database/rows/table/${BASEROW_AGENT_STATE_TABLE_ID}/?user_field_names=true`;
  if (!phoneNumber) {
    return baseUrl;
  }

  const trimmed = phoneNumber.trim();
  if (!trimmed) {
    return baseUrl;
  }

  const query = `&filter__field_${BASEROW_AGENT_STATE_NUMBER_FIELD_ID}__equal=${encodeURIComponent(trimmed)}`;
  return `${baseUrl}${query}`;
};

export const getAgentStateRows = async (phoneNumber?: string): Promise<AgentStateRow[]> => {
  try {
    const url = buildAgentStateUrl(phoneNumber);
    const response = await baserowGet(url, 15000);

    const data = response.data as { results?: AgentStateRow[] };
    const results = Array.isArray(data?.results) ? data.results : [];
    return results;
  } catch (error) {
    console.error("Erro ao buscar EstadoAgente no Baserow:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Detalhes do erro:", error.response.data);
        const errorMessage =
          error.response.data?.message ||
          error.message ||
          "Erro ao buscar registros de EstadoAgente";
        throw new Error(errorMessage);
      }
      if (error.request) {
        throw new Error("Nao foi possivel conectar ao Baserow para ler EstadoAgente");
      }
      throw new Error(error.message || "Erro ao configurar requisicao para EstadoAgente");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao buscar EstadoAgente");
  }
};

export const registerAgentState = async (data: { numero: string; estado: string }): Promise<AgentStateRow> => {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_AGENT_STATE_TABLE_ID}/?user_field_names=true`;
    const payload = {
      numero: data.numero?.trim() ?? "",
      estado: data.estado?.trim() ?? "",
    };

    const response = await baserowPost(url, payload, 15000);

    return response.data as AgentStateRow;
  } catch (error) {
    console.error("Erro ao registrar EstadoAgente no Baserow:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Detalhes do erro:", error.response.data);
        const errorMessage =
          error.response.data?.message ||
          error.message ||
          "Erro ao registrar estado do agente";
        throw new Error(errorMessage);
      }
      if (error.request) {
        throw new Error("Nao foi possivel conectar ao Baserow para registrar EstadoAgente");
      }
      throw new Error(error.message || "Erro ao configurar requisicao para EstadoAgente");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao registrar estado do agente");
  }
};

export type BaserowCaseRow = {
  id: number;
  CaseId?: number;
  CustumerName?: string;
  CustumerPhone?: string;
  Data?: string | null;
  data?: string | null;
  DepoimentoInicial?: string;
  EtapaPerguntas?: string;
  EtapaFinal?: string;
  Conversa?: string;
  Resumo?: string;
  BJCaseId?: string | number;
  InstitutionID?: number;
  "body.auth.institutionId"?: string | number | null;
  IApause?: string;
  last_alert_stage?: string | null;
  valor?: number | string | null;
  resultado?: "ganho" | "perdido" | string | null;
  // New fields
  cliente?: { id: number; value: string }[] | null;
  responsavel?: string;
  department_id?: number | null;
  department_name?: string | null;
  assigned_to_user_id?: number | null;
  status_caso?: { id: number; value: string; color: string } | string | null;
  // WABA phone number associated with this case
  display_phone_number?: string | null;
  // Case origin tracking
  case_source?: string;
  created_by_user_id?: number | null;
  created_by_user_name?: string | null;
  // Lawsuit tracking fields
  cnj_number?: string | null;
  lawsuit_tracking_active?: string | null;
  lawsuit_summary?: string | null;
  lawsuit_last_update?: string | null;
  notas_caso?: string | null;
  // Electronic signature fields
  sign_envelope_id?: string | null;
  sign_status?: string | null;
  [key: string]: unknown;
};

/** Map a Drizzle `cases` row to the Baserow-compatible `BaserowCaseRow` shape */
function mapCaseRow(row: typeof casesTable.$inferSelect): BaserowCaseRow {
  return {
    id: row.id,
    CaseId: row.caseId ?? undefined,
    CustumerPhone: row.custumerPhone ?? undefined,
    CustumerName: row.custumerName ?? undefined,
    DepoimentoInicial: row.depoimentoInicial ?? undefined,
    EtapaPerguntas: row.etapaPerguntas ?? undefined,
    EtapaFinal: row.etapaFinal ?? undefined,
    Resumo: row.resumo ?? undefined,
    Conversa: row.conversa ?? undefined,
    BJCaseId: row.bJCaseId ?? undefined,
    InstitutionID: row.institutionID ? Number(row.institutionID) : undefined,
    IApause: row.iApause ?? undefined,
    image: row.image as BaserowCaseRow["image"],
    Data: row.data ?? undefined,
    CustumeId: row.custumeId ?? undefined,
    last_alert_stage: row.lastAlertStage ?? undefined,
    message_order: row.messageOrder ?? undefined,
    valor: row.valor != null ? Number(row.valor) : undefined,
    resultado: row.resultado ?? undefined,
    responsavel: row.responsavel ?? undefined,
    status_caso: row.statusCaso ?? undefined,
    department_id: row.departmentId != null ? Number(row.departmentId) : undefined,
    department_name: row.departmentName ?? undefined,
    assigned_to_user_id: row.assignedToUserId != null ? Number(row.assignedToUserId) : undefined,
    case_source: row.caseSource ?? undefined,
    created_by_user_id: row.createdByUserId != null ? Number(row.createdByUserId) : undefined,
    created_by_user_name: row.createdByUserName ?? undefined,
    cnj_number: row.cnjNumber ?? undefined,
    lawsuit_tracking_active: row.lawsuitTrackingActive ?? undefined,
    lawsuit_summary: row.lawsuitSummary ?? undefined,
    lawsuit_last_update: row.lawsuitLastUpdate ?? undefined,
    notas_caso: row.notasCaso ?? undefined,
    sign_envelope_id: row.signEnvelopeId ?? undefined,
    sign_status: row.signStatus ?? undefined,
  };
}

/** Build a Drizzle-compatible set object from a Baserow-shaped partial case row */
function buildCaseSetObj(data: Partial<BaserowCaseRow>): Record<string, unknown> {
  const set: Record<string, unknown> = {};

  if (data.CustumerPhone !== undefined) set.custumerPhone = data.CustumerPhone;
  if (data.CustumerName !== undefined) set.custumerName = data.CustumerName;
  if (data.DepoimentoInicial !== undefined) set.depoimentoInicial = data.DepoimentoInicial;
  if (data.EtapaPerguntas !== undefined) set.etapaPerguntas = data.EtapaPerguntas;
  if (data.EtapaFinal !== undefined) set.etapaFinal = data.EtapaFinal;
  if (data.Resumo !== undefined) set.resumo = data.Resumo;
  if (data.Conversa !== undefined) set.conversa = data.Conversa;
  if (data.BJCaseId !== undefined) set.bJCaseId = data.BJCaseId != null ? String(data.BJCaseId) : null;
  if (data.InstitutionID !== undefined) set.institutionID = data.InstitutionID != null ? String(data.InstitutionID) : null;
  if (data.IApause !== undefined) set.iApause = data.IApause;
  if (data.image !== undefined) set.image = data.image;
  if (data.Data !== undefined) set.data = data.Data;
  if ((data as Record<string, unknown>).data !== undefined && data.Data === undefined) set.data = (data as Record<string, unknown>).data as string;
  if (data.CustumeId !== undefined) set.custumeId = data.CustumeId;
  if (data.last_alert_stage !== undefined) set.lastAlertStage = data.last_alert_stage;
  if (data.valor !== undefined) set.valor = data.valor != null ? String(data.valor) : null;
  if (data.resultado !== undefined) set.resultado = data.resultado;
  if (data.responsavel !== undefined) set.responsavel = data.responsavel;
  if (data.status_caso !== undefined) {
    // Baserow Single Select can be string or object { id, value, color }
    set.statusCaso = typeof data.status_caso === "object" && data.status_caso !== null
      ? (data.status_caso as { value: string }).value
      : data.status_caso;
  }
  if (data.department_id !== undefined) set.departmentId = data.department_id != null ? String(data.department_id) : null;
  if (data.department_name !== undefined) set.departmentName = data.department_name;
  if (data.assigned_to_user_id !== undefined) set.assignedToUserId = data.assigned_to_user_id != null ? String(data.assigned_to_user_id) : null;
  if (data.case_source !== undefined) set.caseSource = data.case_source;
  if (data.created_by_user_id !== undefined) set.createdByUserId = data.created_by_user_id != null ? String(data.created_by_user_id) : null;
  if (data.created_by_user_name !== undefined) set.createdByUserName = data.created_by_user_name;
  if (data.cnj_number !== undefined) set.cnjNumber = data.cnj_number;
  if (data.lawsuit_tracking_active !== undefined) set.lawsuitTrackingActive = data.lawsuit_tracking_active;
  if (data.lawsuit_summary !== undefined) set.lawsuitSummary = data.lawsuit_summary;
  if (data.lawsuit_last_update !== undefined) set.lawsuitLastUpdate = data.lawsuit_last_update;
  if (data.notas_caso !== undefined) set.notasCaso = data.notas_caso;
  if (data.sign_envelope_id !== undefined) set.signEnvelopeId = data.sign_envelope_id;
  if (data.sign_status !== undefined) set.signStatus = data.sign_status;

  return set;
}

export type GetBaserowCasesParams = {
  institutionId?: number;
  page?: number;
  pageSize?: number;
  fetchAll?: boolean;
  /** When true + fetchAll, fetches last page first so newest cases appear immediately */
  newestFirst?: boolean;
  /** Limits how many pages to fetch (newestFirst: from the end). Ignored without fetchAll. */
  maxPages?: number;
  /** Called after each page is fetched — enables progressive rendering */
  onPageLoaded?: (partialResults: BaserowCaseRow[], totalCount: number) => void;
  /** Baserow `include` fields — only return these fields (reduces payload dramatically) */
  includeFields?: string[];
};

export type BaserowCasesResponse = {
  results: BaserowCaseRow[];
  totalCount: number;
  hasNextPage: boolean;
};

export const getBaserowCaseById = async (
  rowId: number,
): Promise<BaserowCaseRow | null> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      if (!rowId) return null;
      const [row] = await prepared.getCaseById.execute({ id: rowId });
      return row ? mapCaseRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    if (!rowId) {
      return null;
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/?user_field_names=true`;
    const response = await baserowGet(url, 20000);

    return response.data as BaserowCaseRow;
  } catch (error) {
    if (
      (axios.isAxiosError(error) && error.response?.status === 404) ||
      (error instanceof BaserowHttpError && error.status === 404)
    ) {
      return null;
    }
    if (axios.isAxiosError(error)) {

      if (error.response) {
        const errorMessage =
          error.response.data?.message ||
          error.message ||
          "Erro ao buscar caso no Baserow";
        throw new Error(errorMessage);
      }
      if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(
      error instanceof Error ? error.message : "Erro desconhecido ao buscar caso",
    );
  }
};

const normalizeNextUrl = (value: unknown): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    const baseUrl = new URL(BASEROW_API_URL);
    const parsed = new URL(value, baseUrl);
    // Garantir que usamos o mesmo protocolo/host configurado
    parsed.protocol = baseUrl.protocol;
    parsed.host = baseUrl.host;
    parsed.port = baseUrl.port;
    return parsed.toString();
  } catch {
    return null;
  }
};

/* ────────────── Aggregated case statistics (SQL) ────────────── */

const FALSY_VALUES = "('não','nao','false','0','off','')";

/**
 * Compute case statistics via a single SQL aggregate query.
 * Returns per-institution breakdown (GROUP BY) for SysAdmin,
 * or a single-institution result for regular users.
 *
 * Falls back to null so the caller can use getBaserowCases + computeCaseStatistics.
 */
export const getCaseStatisticsSQL = async (
  institutionId?: number,
): Promise<{
  total: CaseStatsSQLRow[];
} | null> => {
  if (!useDirectDb("api")) return null;

  const result = await tryDrizzle(async () => {
    const isSysAdmin = institutionId === 4 || institutionId === undefined;
    const whereClause = isSysAdmin
      ? sql``
      : sql`WHERE field_1692 = ${String(institutionId)}`;

    const result = await db.execute(sql`
      SELECT
        COALESCE(field_1692, '') AS institution_id,
        CAST(COUNT(*) AS integer) AS total,
        CAST(COUNT(*) FILTER (WHERE lower(trim(COALESCE(field_1693,'')))
          IN ('sim','pausado','true','1','yes')) AS integer) AS paused,
        CAST(COUNT(*) FILTER (WHERE
          COALESCE(trim(field_1688),'') != ''
          AND lower(trim(field_1688)) NOT IN ${sql.raw(FALSY_VALUES)}
        ) AS integer) AS etapa_final,
        CAST(COUNT(*) FILTER (WHERE
          (COALESCE(trim(field_1688),'') = '' OR lower(trim(field_1688)) IN ${sql.raw(FALSY_VALUES)})
          AND COALESCE(trim(field_1687),'') != ''
          AND lower(trim(field_1687)) NOT IN ${sql.raw(FALSY_VALUES)}
        ) AS integer) AS etapa_perguntas,
        CAST(COUNT(*) FILTER (WHERE
          (COALESCE(trim(field_1688),'') = '' OR lower(trim(field_1688)) IN ${sql.raw(FALSY_VALUES)})
          AND (COALESCE(trim(field_1687),'') = '' OR lower(trim(field_1687)) IN ${sql.raw(FALSY_VALUES)})
          AND COALESCE(trim(field_1686),'') != ''
          AND lower(trim(field_1686)) NOT IN ${sql.raw(FALSY_VALUES)}
        ) AS integer) AS depoimento_inicial,
        CAST(COUNT(*) FILTER (WHERE
          field_1699 IS NOT NULL AND field_1699 != ''
          AND field_1699 ~ '^\\d{4}-'
          AND field_1699::timestamptz >= NOW() - INTERVAL '7 days'
        ) AS integer) AS last_7_days,
        CAST(COUNT(*) FILTER (WHERE
          field_1699 IS NOT NULL AND field_1699 != ''
          AND field_1699 ~ '^\\d{4}-'
          AND field_1699::timestamptz >= NOW() - INTERVAL '30 days'
        ) AS integer) AS last_30_days
      FROM database_table_225
      ${whereClause}
      GROUP BY field_1692
    `);

    return { total: result.rows as CaseStatsSQLRow[] };
  });

  if (result === undefined) return null;
  return result as { total: CaseStatsSQLRow[] };
};

type CaseStatsSQLRow = {
  institution_id: string;
  total: number;
  paused: number;
  etapa_final: number;
  etapa_perguntas: number;
  depoimento_inicial: number;
  last_7_days: number;
  last_30_days: number;
};

export const getBaserowCases = async ({
  institutionId,
  page = 1,
  pageSize = 200,
  fetchAll = false,
  newestFirst = false,
  maxPages,
  onPageLoaded,
  includeFields,
}: GetBaserowCasesParams = {}): Promise<BaserowCasesResponse> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      // Build WHERE conditions
      const conditions = [];
      const useInstFilter = typeof institutionId === "number" && institutionId !== 4;
      if (useInstFilter) {
        conditions.push(eq(casesTable.institutionID, String(institutionId)));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;
  
      if (fetchAll) {
        // Fetch everything in one query (no pagination needed with direct DB)
        const rows = await db
          .select()
          .from(casesTable)
          .where(whereClause)
          .orderBy(newestFirst ? desc(casesTable.id) : asc(casesTable.id));
  
        const results = rows.map(mapCaseRow);
        const totalCount = results.length;
  
        if (onPageLoaded) {
          onPageLoaded([...results], totalCount);
        }
  
        return { results, totalCount, hasNextPage: false };
      }
  
      // Paginated query
      const [countResult] = await db
        .select({ total: sql<number>`cast(count(*) as integer)` })
        .from(casesTable)
        .where(whereClause);
      const totalCount = countResult?.total ?? 0;
  
      const offset = (page - 1) * pageSize;
      const rows = await db
        .select()
        .from(casesTable)
        .where(whereClause)
        .orderBy(newestFirst ? desc(casesTable.id) : asc(casesTable.id))
        .limit(pageSize)
        .offset(offset);
  
      const results = rows.map(mapCaseRow);
      const hasNextPage = offset + results.length < totalCount;
  
      if (onPageLoaded) {
        onPageLoaded([...results], totalCount);
      }
  
      return { results, totalCount, hasNextPage };
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    // Usar filtro server-side do Baserow para instituições não-admin
    const useServerFilter =
      typeof institutionId === "number" && institutionId !== 4;

    const buildUrl = (targetPage: number) => {
      const params = new URLSearchParams({
        user_field_names: "true",
        page: String(targetPage),
        size: String(pageSize),
      });
      if (useServerFilter) {
        params.set("filter__InstitutionID__equal", String(institutionId));
      }
      if (includeFields?.length) {
        params.set("include", includeFields.join(","));
      }
      return `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?${params.toString()}`;
    };

    const shouldFetchAll = Boolean(fetchAll);

    // Newest-first: fetch last page first so the UI shows recent cases immediately
    if (shouldFetchAll && newestFirst) {
      // Step 1: Fetch page 1 to get total count
      const firstResponse = await baserowGet<BaserowListResponse<FollowUpHistoryRow>>(
        buildUrl(1),
      );

      const firstPageResults: BaserowCaseRow[] = firstResponse.data?.results || [];
      const totalCount = typeof firstResponse.data?.count === "number"
        ? firstResponse.data.count
        : firstPageResults.length;
      const totalPages = Math.ceil(totalCount / pageSize);

      // Single page — return immediately
      if (totalPages <= 1) {
        if (onPageLoaded) {
          onPageLoaded([...firstPageResults], totalCount);
        }
        return { results: firstPageResults, totalCount, hasNextPage: false };
      }

      // Step 2: Fetch from last page backwards (newest cases first)
      // maxPages = total API calls allowed (page 1 already used one)
      const pageBudget = maxPages && maxPages > 0 ? maxPages - 1 : totalPages - 1;
      const allResults: BaserowCaseRow[] = [];
      const seenIds = new Set<number>();
      let pagesLoaded = 0;

      const pushUnique = (rows: BaserowCaseRow[]) => {
        for (const row of rows) {
          if (!seenIds.has(row.id)) {
            seenIds.add(row.id);
            allResults.push(row);
          }
        }
      };

      // Build list of pages to fetch (from last to 2nd)
      const pagesToFetch: number[] = [];
      for (let p = totalPages; p >= 2 && pagesToFetch.length < pageBudget; p--) {
        pagesToFetch.push(p);
      }

      // Fetch all pages in PARALLEL (instead of sequential)
      const pageResponses = await Promise.all(
        pagesToFetch.map((p) =>
          baserowGet<BaserowListResponse<FollowUpHistoryRow>>(buildUrl(p))
            .then((resp) => ({ page: p, results: (resp.data?.results || []) as BaserowCaseRow[] })),
        ),
      );

      // Process results in page order (highest first = newest first)
      pageResponses.sort((a, b) => b.page - a.page);
      for (const pr of pageResponses) {
        pushUnique(pr.results);
        pagesLoaded++;
      }

      // Append page 1 data only if we fetched ALL remaining pages (complete dataset)
      if (pagesLoaded >= totalPages - 1) {
        pushUnique(firstPageResults);
      }

      if (onPageLoaded && pagesLoaded > 0) {
        onPageLoaded([...allResults], totalCount);
      }

      return {
        results: allResults,
        totalCount,
        hasNextPage: allResults.length < totalCount,
      };
    }

    // Standard ascending fetch
    const initialUrl = buildUrl(shouldFetchAll ? 1 : page);

    const allResults: BaserowCaseRow[] = [];
    let nextUrl: string | null = initialUrl;
    let hasNextPage = false;
    let totalCount: number | null = null;

    while (nextUrl) {
      const response = await baserowGet<BaserowListResponse<FollowUpHistoryRow>>(nextUrl);

      const pageResults: BaserowCaseRow[] = response.data?.results || [];
      allResults.push(...pageResults);
      if (typeof response.data?.count === "number") {
        totalCount = response.data.count;
      }

      // Notify caller with partial results for progressive rendering
      if (onPageLoaded && totalCount !== null) {
        onPageLoaded([...allResults], totalCount);
      }

      const nextFromResponse = normalizeNextUrl(response.data?.next);
      if (shouldFetchAll) {
        nextUrl = nextFromResponse;
        hasNextPage = Boolean(nextFromResponse);
      } else {
        hasNextPage = Boolean(nextFromResponse);
        break;
      }
    }

    return {
      results: allResults,
      totalCount: typeof totalCount === "number" ? totalCount : allResults.length,
      hasNextPage,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar casos do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao buscar casos");
  }
};

export const updateBaserowCase = async (
  rowId: number,
  data: Partial<BaserowCaseRow>,
): Promise<BaserowCaseRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj = buildCaseSetObj(data);
      const [updated] = await db
        .update(casesTable)
        .set(setObj)
        .where(eq(casesTable.id, rowId))
        .returning();
      return mapCaseRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/?user_field_names=true`;

    const response = await baserowPatch(url, data);

    return response.data as BaserowCaseRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar caso do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao atualizar caso");
  }
};

export const createBaserowCase = async (
  data: Partial<BaserowCaseRow>,
): Promise<BaserowCaseRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const values = buildCaseSetObj(data);
      const [created] = await db
        .insert(casesTable)
        .values(values)
        .returning();
      return mapCaseRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?user_field_names=true`;
    const response = await baserowPost(url, data);
    return response.data as BaserowCaseRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar caso no Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao criar caso");
  }
};

// ============================================
// WEBHOOKS / ALERTS
// ============================================

const BASEROW_WEBHOOKS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_WEBHOOKS_TABLE_ID ||
      process.env.BASEROW_WEBHOOKS_TABLE_ID,
  ) || 228;

export type WebhookRow = {
  id: number;
  webhoock_institution_id?: number;
  webhook_url?: string;
  webhook_name?: string;
  webhook_secret?: string;
  alert_depoimento_inicial?: boolean;
  alert_etapa_perguntas?: boolean;
  alert_etapa_final?: boolean;
  webhook_active?: string;
  created_at?: string;
  updated_at?: string;
  last_triggered_at?: string;
  last_status?: string;
  [key: string]: unknown;
};

export type CreateWebhookPayload = {
  webhoock_institution_id: number;
  webhook_url: string;
  webhook_name?: string;
  webhook_secret?: string;
  alert_depoimento_inicial?: boolean;
  alert_etapa_perguntas?: boolean;
  alert_etapa_final?: boolean;
  webhook_active?: string;
};

export type UpdateWebhookPayload = Partial<Omit<WebhookRow, "id">>;

/** Serialize alert_* booleans → JSON string for webhook_alerts field */
function serializeAlerts(data: Partial<WebhookRow>): string {
  return JSON.stringify({
    alert_depoimento_inicial: data.alert_depoimento_inicial ?? true,
    alert_etapa_perguntas: data.alert_etapa_perguntas ?? true,
    alert_etapa_final: data.alert_etapa_final ?? true,
  });
}

/** Deserialize webhook_alerts JSON → alert_* booleans */
function deserializeAlerts(raw: string | null | undefined): Pick<WebhookRow, "alert_depoimento_inicial" | "alert_etapa_perguntas" | "alert_etapa_final"> {
  const defaults = { alert_depoimento_inicial: true, alert_etapa_perguntas: true, alert_etapa_final: true };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    return {
      alert_depoimento_inicial: parsed.alert_depoimento_inicial ?? true,
      alert_etapa_perguntas: parsed.alert_etapa_perguntas ?? true,
      alert_etapa_final: parsed.alert_etapa_final ?? true,
    };
  } catch {
    return defaults;
  }
}

/** Map Drizzle row → WebhookRow */
function mapWhRow(row: typeof whTable.$inferSelect): WebhookRow {
  return {
    id: row.id,
    webhoock_institution_id: Number(row.webhoockInstitutionId) || 0,
    webhook_url: row.webhookUrl || "",
    webhook_secret: row.webhookSecret || "",
    webhook_active: row.webhookActive || "",
    webhook_alerts: row.webhookAlerts || "",
    ...deserializeAlerts(row.webhookAlerts),
  };
}

export const getWebhooks = async (institutionId?: number): Promise<WebhookRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (typeof institutionId === "number") {
        conditions.push(eq(whTable.webhoockInstitutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(whTable)
        .where(conditions.length ? and(...conditions) : undefined);
      return rows.map(mapWhRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_WEBHOOKS_TABLE_ID}/?user_field_names=true`;

    const response = await baserowGet(url);

    let results: WebhookRow[] = (response.data as { results?: WebhookRow[] })?.results || [];

    // Deserializar alert_* do campo webhook_alerts (Baserow retorna como texto)
    results = results.map((row) => ({
      ...row,
      ...deserializeAlerts(row.webhook_alerts as string | undefined),
    }));

    if (typeof institutionId === "number") {
      results = results.filter((row) => {
        const rowInstitutionId = row.webhoock_institution_id;
        return rowInstitutionId === institutionId ||
          String(rowInstitutionId) === String(institutionId);
      });
    }

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar webhooks";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao buscar webhooks");
  }
};

export const createWebhook = async (data: CreateWebhookPayload): Promise<WebhookRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const [created] = await db
        .insert(whTable)
        .values({
          webhoockInstitutionId: String(data.webhoock_institution_id),
          webhookUrl: data.webhook_url,
          webhookSecret: data.webhook_secret ?? "",
          webhookActive: data.webhook_active ?? "sim",
          webhookAlerts: serializeAlerts(data),
        })
        .returning();
      return mapWhRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_WEBHOOKS_TABLE_ID}/?user_field_names=true`;

    const { alert_depoimento_inicial, alert_etapa_perguntas, alert_etapa_final, ...rest } = data;
    const payload = {
      ...rest,
      webhook_active: data.webhook_active ?? "sim",
      webhook_alerts: serializeAlerts(data),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await baserowPost(url, payload);

    return response.data as WebhookRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar webhook";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao criar webhook");
  }
};

export const updateWebhook = async (
  rowId: number,
  data: UpdateWebhookPayload,
): Promise<WebhookRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj: Record<string, unknown> = {};
      if (data.webhook_url !== undefined) setObj.webhookUrl = data.webhook_url;
      if (data.webhook_secret !== undefined) setObj.webhookSecret = data.webhook_secret;
      if (data.webhook_active !== undefined) setObj.webhookActive = data.webhook_active;
      if (data.webhoock_institution_id !== undefined) setObj.webhoockInstitutionId = String(data.webhoock_institution_id);
      // Serializar alert_* no campo webhook_alerts
      if (data.alert_depoimento_inicial !== undefined || data.alert_etapa_perguntas !== undefined || data.alert_etapa_final !== undefined) {
        setObj.webhookAlerts = serializeAlerts(data);
      }

      const [updated] = await db
        .update(whTable)
        .set(setObj)
        .where(eq(whTable.id, rowId))
        .returning();
      return mapWhRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_WEBHOOKS_TABLE_ID}/${rowId}/?user_field_names=true`;

    const { alert_depoimento_inicial, alert_etapa_perguntas, alert_etapa_final, ...restUpdate } = data;
    const payload: Record<string, unknown> = {
      ...restUpdate,
      updated_at: new Date().toISOString(),
    };
    if (alert_depoimento_inicial !== undefined || alert_etapa_perguntas !== undefined || alert_etapa_final !== undefined) {
      payload.webhook_alerts = serializeAlerts(data);
    }

    const response = await baserowPatch(url, payload);

    return response.data as WebhookRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar webhook";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao atualizar webhook");
  }
};

export const deleteWebhook = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(whTable).where(eq(whTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_WEBHOOKS_TABLE_ID}/${rowId}/`;

    await baserowDelete(url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao excluir webhook";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao excluir webhook");
  }
};

// ============================================
// FOLLOW-UP
// ============================================

const BASEROW_FOLLOW_UP_CONFIG_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_FOLLOW_UP_CONFIG_TABLE_ID ||
      process.env.BASEROW_FOLLOW_UP_CONFIG_TABLE_ID,
  ) || 229;

const BASEROW_FOLLOW_UP_HISTORY_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_FOLLOW_UP_HISTORY_TABLE_ID ||
      process.env.BASEROW_FOLLOW_UP_HISTORY_TABLE_ID,
  ) || 230;

export type FollowUpConfigRow = {
  id: number;
  institution_id?: number;
  message_order?: number;
  delay_minutes?: number;
  message_content?: string;
  is_active?: string;
  allowed_days?: string;
  allowed_start_time?: string;
  allowed_end_time?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type CreateFollowUpConfigPayload = {
  institution_id: number;
  message_order: number;
  delay_minutes: number;
  message_content: string;
  is_active?: string;
  allowed_days?: string;
  allowed_start_time?: string;
  allowed_end_time?: string;
};

export type UpdateFollowUpConfigPayload = Partial<Omit<FollowUpConfigRow, "id">>;

export type FollowUpHistoryRow = {
  id: number;
  case_id?: number;
  institution_id?: number;
  config_id?: number;
  message_order?: number;
  customer_phone?: string;
  message_sent?: string;
  sent_at?: string;
  status?: string;
  error_message?: string;
  last_client_message_at?: string;
  [key: string]: unknown;
};

export type CreateFollowUpHistoryPayload = {
  case_id: number;
  institution_id: number;
  config_id: number;
  message_order: number;
  customer_phone?: string;
  message_sent: string;
  sent_at?: string;
  status: string;
  error_message?: string;
  last_client_message_at?: string;
};

/** Map Drizzle row → FollowUpConfigRow */
function mapFucRow(row: typeof fucTable.$inferSelect): FollowUpConfigRow {
  return {
    id: row.id,
    institution_id: Number(row.institutionId) || 0,
    message_order: Number(row.messageOrder) || 0,
    delay_minutes: Number(row.delayMinutes) || 0,
    message_content: row.messageContent || "",
    is_active: row.isActive || "",
    allowed_days: row.allowedDays || "",
    allowed_start_time: row.allowedStartTime || "",
    allowed_end_time: row.allowedEndTime || "",
    created_at: row.createdAt ? row.createdAt.toISOString() : undefined,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : undefined,
  };
}

/** Map Drizzle row → FollowUpHistoryRow */
function mapFuhRow(row: typeof fuhTable.$inferSelect): FollowUpHistoryRow {
  return {
    id: row.id,
    case_id: Number(row.caseId) || 0,
    institution_id: Number(row.institutionId) || 0,
    config_id: Number(row.configId) || 0,
    message_order: Number(row.messageOrder) || 0,
    customer_phone: row.customerPhone || "",
    message_sent: row.messageSent || "",
    sent_at: row.sentAt ? row.sentAt.toISOString() : undefined,
    status: row.status || "",
    error_message: row.errorMessage || "",
    last_client_message_at: row.lastClientMessageAt ? row.lastClientMessageAt.toISOString() : undefined,
  };
}

// Follow-up Config CRUD
export const getFollowUpConfigs = async (institutionId?: number): Promise<FollowUpConfigRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (typeof institutionId === "number") {
        conditions.push(eq(fucTable.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(fucTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(fucTable.messageOrder));
      return rows.map(mapFucRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_CONFIG_TABLE_ID}/?user_field_names=true&size=200`;

    const response = await baserowGet(url);

    let results: FollowUpConfigRow[] = (response.data as { results?: FollowUpConfigRow[] })?.results || [];

    if (typeof institutionId === "number") {
      results = results.filter((row) => {
        const rowInstitutionId = row.institution_id;
        return rowInstitutionId === institutionId ||
          String(rowInstitutionId) === String(institutionId);
      });
    }

    // Ordenar por message_order
    results.sort((a, b) => (a.message_order ?? 0) - (b.message_order ?? 0));

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar configurações de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const createFollowUpConfig = async (data: CreateFollowUpConfigPayload): Promise<FollowUpConfigRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const now = new Date();
      const [created] = await db
        .insert(fucTable)
        .values({
          institutionId: String(data.institution_id),
          messageOrder: String(data.message_order),
          delayMinutes: String(data.delay_minutes),
          messageContent: data.message_content,
          isActive: data.is_active ?? "sim",
          allowedDays: data.allowed_days ?? "seg,ter,qua,qui,sex",
          allowedStartTime: data.allowed_start_time ?? "08:00",
          allowedEndTime: data.allowed_end_time ?? "18:00",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapFucRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_CONFIG_TABLE_ID}/?user_field_names=true`;

    const payload = {
      ...data,
      is_active: data.is_active ?? "sim",
      allowed_days: data.allowed_days ?? "seg,ter,qua,qui,sex",
      allowed_start_time: data.allowed_start_time ?? "08:00",
      allowed_end_time: data.allowed_end_time ?? "18:00",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await baserowPost(url, payload);

    return response.data as FollowUpConfigRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar configuração de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateFollowUpConfig = async (
  rowId: number,
  data: UpdateFollowUpConfigPayload,
): Promise<FollowUpConfigRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj: Record<string, unknown> = { updatedAt: new Date() };
      if (data.institution_id !== undefined) setObj.institutionId = String(data.institution_id);
      if (data.message_order !== undefined) setObj.messageOrder = String(data.message_order);
      if (data.delay_minutes !== undefined) setObj.delayMinutes = String(data.delay_minutes);
      if (data.message_content !== undefined) setObj.messageContent = data.message_content;
      if (data.is_active !== undefined) setObj.isActive = data.is_active;
      if (data.allowed_days !== undefined) setObj.allowedDays = data.allowed_days;
      if (data.allowed_start_time !== undefined) setObj.allowedStartTime = data.allowed_start_time;
      if (data.allowed_end_time !== undefined) setObj.allowedEndTime = data.allowed_end_time;
  
      const [updated] = await db
        .update(fucTable)
        .set(setObj)
        .where(eq(fucTable.id, rowId))
        .returning();
      return mapFucRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_CONFIG_TABLE_ID}/${rowId}/?user_field_names=true`;

    const payload = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const response = await baserowPatch(url, payload);

    return response.data as FollowUpConfigRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar configuração de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const deleteFollowUpConfig = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(fucTable).where(eq(fucTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_CONFIG_TABLE_ID}/${rowId}/`;

    await baserowDelete(url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao excluir configuração de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

// Follow-up History
export const getFollowUpHistory = async (caseId?: number, institutionId?: number): Promise<FollowUpHistoryRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (typeof caseId === "number") {
        conditions.push(eq(fuhTable.caseId, String(caseId)));
      }
      if (typeof institutionId === "number") {
        conditions.push(eq(fuhTable.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(fuhTable)
        .where(conditions.length ? and(...conditions) : undefined);
      return rows.map(mapFuhRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const pageSize = 200;
    const collected: FollowUpHistoryRow[] = [];
    let nextUrl: string | null = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_HISTORY_TABLE_ID}/?user_field_names=true&size=${pageSize}`;

    // Paginar para buscar todos os registros
    while (nextUrl) {
      const resp = await baserowGet<BaserowListResponse<FollowUpHistoryRow>>(nextUrl!);

      const data: BaserowListResponse<FollowUpHistoryRow> = resp.data;
      const rows: FollowUpHistoryRow[] = data?.results || [];
      collected.push(...rows);

      // Normalizar a URL do próximo para usar o mesmo host
      const rawNext = data?.next;
      if (rawNext && typeof rawNext === "string") {
        try {
          const base = new URL(BASEROW_API_URL);
          const parsed = new URL(rawNext, base);
          parsed.protocol = base.protocol;
          parsed.host = base.host;
          parsed.port = base.port;
          nextUrl = parsed.toString();
        } catch {
          nextUrl = null;
        }
      } else {
        nextUrl = null;
      }
    }

    let results = collected;

    if (typeof caseId === "number") {
      results = results.filter((row) => row.case_id === caseId);
    }

    if (typeof institutionId === "number") {
      results = results.filter((row) => {
        const rowInstitutionId = row.institution_id;
        return rowInstitutionId === institutionId ||
          String(rowInstitutionId) === String(institutionId);
      });
    }

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar histórico de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const createFollowUpHistory = async (data: CreateFollowUpHistoryPayload): Promise<FollowUpHistoryRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const sentAt = data.sent_at ? new Date(data.sent_at) : new Date();
      const [created] = await db
        .insert(fuhTable)
        .values({
          caseId: String(data.case_id),
          institutionId: String(data.institution_id),
          configId: String(data.config_id),
          messageOrder: String(data.message_order),
          customerPhone: data.customer_phone ?? "",
          messageSent: data.message_sent,
          sentAt: sentAt,
          status: data.status,
          errorMessage: data.error_message ?? "",
          lastClientMessageAt: data.last_client_message_at ? new Date(data.last_client_message_at) : null,
        })
        .returning();
      return mapFuhRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_HISTORY_TABLE_ID}/?user_field_names=true`;

    const payload = {
      ...data,
      sent_at: data.sent_at ?? new Date().toISOString(),
    };

    const response = await baserowPost(url, payload);

    return response.data as FollowUpHistoryRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar registro de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateFollowUpHistory = async (
  rowId: number,
  data: Partial<FollowUpHistoryRow>,
): Promise<FollowUpHistoryRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj: Record<string, unknown> = {};
      if (data.case_id !== undefined) setObj.caseId = String(data.case_id);
      if (data.institution_id !== undefined) setObj.institutionId = String(data.institution_id);
      if (data.config_id !== undefined) setObj.configId = String(data.config_id);
      if (data.message_order !== undefined) setObj.messageOrder = String(data.message_order);
      if (data.customer_phone !== undefined) setObj.customerPhone = data.customer_phone;
      if (data.message_sent !== undefined) setObj.messageSent = data.message_sent;
      if (data.sent_at !== undefined) setObj.sentAt = data.sent_at ? new Date(data.sent_at) : null;
      if (data.status !== undefined) setObj.status = data.status;
      if (data.error_message !== undefined) setObj.errorMessage = data.error_message;
      if (data.last_client_message_at !== undefined) setObj.lastClientMessageAt = data.last_client_message_at ? new Date(data.last_client_message_at) : null;
  
      const [updated] = await db
        .update(fuhTable)
        .set(setObj)
        .where(eq(fuhTable.id, rowId))
        .returning();
      return mapFuhRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_FOLLOW_UP_HISTORY_TABLE_ID}/${rowId}/?user_field_names=true`;

    const response = await baserowPatch(url, data);

    return response.data as FollowUpHistoryRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar registro de follow-up";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

// ============================================
// KANBAN
// ============================================

const BASEROW_KANBAN_COLUMNS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_KANBAN_COLUMNS_TABLE_ID ||
      process.env.BASEROW_KANBAN_COLUMNS_TABLE_ID,
  ) || 231;

const BASEROW_CASE_KANBAN_STATUS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CASE_KANBAN_STATUS_TABLE_ID ||
      process.env.BASEROW_CASE_KANBAN_STATUS_TABLE_ID,
  ) || 232;

// Kanban Column type
export type KanbanColumnRow = {
  id: number;
  institution_id?: number;
  department_id?: number | null;
  name?: string;
  ordem?: number;
  color?: string;
  is_default?: string;
  auto_rule?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type CreateKanbanColumnPayload = {
  institution_id: number;
  department_id?: number | null;
  name: string;
  ordem: number;
  color?: string;
  is_default?: string;
  auto_rule?: string | null;
};

export type UpdateKanbanColumnPayload = Partial<Omit<KanbanColumnRow, "id">>;

// Case Kanban Status type
export type CaseKanbanStatusRow = {
  id: number;
  case_id?: number;
  institution_id?: number;
  column_id?: number;
  moved_at?: string;
  moved_by?: string;
  notes?: string;
  [key: string]: unknown;
};

export type CreateCaseKanbanStatusPayload = {
  case_id: number;
  institution_id: number;
  column_id: number;
  moved_at?: string;
  moved_by?: string;
  notes?: string;
};

/** Map Drizzle row → KanbanColumnRow (camelCase → snake_case for API compat) */
function mapKcRow(row: typeof kcTable.$inferSelect): KanbanColumnRow {
  return {
    id: row.id,
    institution_id: Number(row.institutionId) || 0,
    name: row.name || "",
    ordem: Number(row.ordem) || 0,
    color: row.color || "",
    is_default: row.isDefault || "",
    auto_rule: row.autoRule || null,
    created_at: row.createdAt ? row.createdAt.toISOString() : undefined,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : undefined,
    department_id: row.departmentId ? Number(row.departmentId) : null,
  };
}

/** Map Drizzle row → CaseKanbanStatusRow */
function mapCksRow(row: typeof cksTable.$inferSelect): CaseKanbanStatusRow {
  return {
    id: row.id,
    case_id: Number(row.caseId) || 0,
    institution_id: Number(row.institutionId) || 0,
    column_id: Number(row.columnId) || 0,
    moved_at: row.movedAt ? row.movedAt.toISOString() : undefined,
    moved_by: row.movedBy || "",
    notes: row.notes || "",
  };
}

// Kanban Columns CRUD
export const getKanbanColumns = async (
  institutionId?: number,
  departmentId?: number | null,
): Promise<KanbanColumnRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (typeof institutionId === "number") {
        conditions.push(eq(kcTable.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(kcTable)
        .where(conditions.length ? and(...conditions) : undefined);
  
      let results = rows.map(mapKcRow);
  
      // Department-scoped columns — strict isolation (no fallback)
      if (departmentId !== undefined && departmentId !== null) {
        results = results.filter((row) => Number(row.department_id) === departmentId);
      } else {
        results = results.filter((row) => !row.department_id);
      }
  
      // Remove duplicates by name within scope, keeping the one with the lowest ID
      const seenNames = new Map<string, KanbanColumnRow>();
      for (const row of results) {
        const name = (row.name || "").toLowerCase().trim();
        const existing = seenNames.get(name);
        if (!existing || row.id < existing.id) {
          seenNames.set(name, row);
        }
      }
      results = Array.from(seenNames.values());
  
      results.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
      return results;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const params = new URLSearchParams({
      user_field_names: "true",
      size: "200",
    });

    // Server-side filter by institution to reduce data transfer
    if (typeof institutionId === "number") {
      params.set("filter__institution_id__equal", String(institutionId));
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_KANBAN_COLUMNS_TABLE_ID}/?${params.toString()}`;

    const response = await baserowGet(url);

    let results: KanbanColumnRow[] = (response.data as { results?: KanbanColumnRow[] })?.results || [];

    // Department-scoped columns — strict isolation (no fallback)
    if (departmentId !== undefined && departmentId !== null) {
      // Only return columns belonging to this specific department
      results = results.filter(
        (row) => Number(row.department_id) === departmentId,
      );
    } else {
      // No department selected: show institution defaults only
      results = results.filter(
        (row) => !row.department_id,
      );
    }

    // Remove duplicates by name within scope, keeping the one with the lowest ID
    const seenNames = new Map<string, KanbanColumnRow>();
    for (const row of results) {
      const name = (row.name || "").toLowerCase().trim();
      const existing = seenNames.get(name);
      if (!existing || Number(row.id) < Number(existing.id)) {
        seenNames.set(name, row);
      }
    }
    results = Array.from(seenNames.values());

    results.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar colunas do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const createKanbanColumn = async (data: CreateKanbanColumnPayload): Promise<KanbanColumnRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const now = new Date();
      const [created] = await db
        .insert(kcTable)
        .values({
          institutionId: String(data.institution_id),
          name: data.name,
          ordem: String(data.ordem),
          color: data.color ?? "",
          isDefault: data.is_default ?? "não",
          autoRule: data.auto_rule ?? null,
          departmentId: data.department_id != null ? String(data.department_id) : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapKcRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_KANBAN_COLUMNS_TABLE_ID}/?user_field_names=true`;

    const payload = {
      ...data,
      department_id: data.department_id ?? null,
      is_default: data.is_default ?? "não",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await baserowPost(url, payload);

    return response.data as KanbanColumnRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar coluna do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateKanbanColumn = async (
  rowId: number,
  data: UpdateKanbanColumnPayload,
): Promise<KanbanColumnRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) setObj.name = data.name;
      if (data.ordem !== undefined) setObj.ordem = String(data.ordem);
      if (data.color !== undefined) setObj.color = data.color;
      if (data.is_default !== undefined) setObj.isDefault = data.is_default;
      if (data.auto_rule !== undefined) setObj.autoRule = data.auto_rule;
      if (data.institution_id !== undefined) setObj.institutionId = String(data.institution_id);
      if (data.department_id !== undefined) setObj.departmentId = data.department_id != null ? String(data.department_id) : null;
  
      const [updated] = await db
        .update(kcTable)
        .set(setObj)
        .where(eq(kcTable.id, rowId))
        .returning();
      return mapKcRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_KANBAN_COLUMNS_TABLE_ID}/${rowId}/?user_field_names=true`;

    const payload = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const response = await baserowPatch(url, payload);

    return response.data as KanbanColumnRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar coluna do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const deleteKanbanColumn = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(kcTable).where(eq(kcTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_KANBAN_COLUMNS_TABLE_ID}/${rowId}/`;

    await baserowDelete(url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao excluir coluna do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

// Case Kanban Status CRUD
export const getCaseKanbanStatus = async (
  caseId?: number,
  institutionId?: number,
): Promise<CaseKanbanStatusRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (typeof caseId === "number") {
        conditions.push(eq(cksTable.caseId, String(caseId)));
      }
      if (typeof institutionId === "number") {
        conditions.push(eq(cksTable.institutionId, String(institutionId)));
      }
      const rows = await db
        .select()
        .from(cksTable)
        .where(conditions.length ? and(...conditions) : undefined);
      return rows.map(mapCksRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const collected: CaseKanbanStatusRow[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        user_field_names: "true",
        size: "200",
        page: String(page),
      });

      // Server-side filters to reduce data transfer
      if (typeof institutionId === "number") {
        params.set("filter__institution_id__equal", String(institutionId));
      }
      if (typeof caseId === "number") {
        params.set("filter__case_id__equal", String(caseId));
      }

      const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_KANBAN_STATUS_TABLE_ID}/?${params.toString()}`;

      const response = await baserowGet<BaserowListResponse<CaseKanbanStatusRow>>(url);

      const rows: CaseKanbanStatusRow[] = response.data?.results || [];
      collected.push(...rows);

      hasMore = Boolean(response.data?.next && rows.length);
      page += 1;
    }

    return collected;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar status do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Nǜo foi poss��vel conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisi��ǜo");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};
export const createCaseKanbanStatus = async (
  data: CreateCaseKanbanStatusPayload,
): Promise<CaseKanbanStatusRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const now = data.moved_at ? new Date(data.moved_at) : new Date();
      const [created] = await db
        .insert(cksTable)
        .values({
          caseId: String(data.case_id),
          institutionId: String(data.institution_id),
          columnId: String(data.column_id),
          movedAt: now,
          movedBy: data.moved_by ?? "",
          notes: data.notes ?? "",
        })
        .returning();
      return mapCksRow(created);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_KANBAN_STATUS_TABLE_ID}/?user_field_names=true`;

    const payload = {
      ...data,
      moved_at: data.moved_at ?? new Date().toISOString(),
    };

    const response = await baserowPost(url, payload);

    return response.data as CaseKanbanStatusRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao criar status do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateCaseKanbanStatus = async (
  rowId: number,
  data: Partial<CaseKanbanStatusRow>,
): Promise<CaseKanbanStatusRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj: Record<string, unknown> = { movedAt: new Date() };
      if (data.case_id !== undefined) setObj.caseId = String(data.case_id);
      if (data.institution_id !== undefined) setObj.institutionId = String(data.institution_id);
      if (data.column_id !== undefined) setObj.columnId = String(data.column_id);
      if (data.moved_by !== undefined) setObj.movedBy = data.moved_by;
      if (data.notes !== undefined) setObj.notes = data.notes;
  
      const [updated] = await db
        .update(cksTable)
        .set(setObj)
        .where(eq(cksTable.id, rowId))
        .returning();
      return mapCksRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_KANBAN_STATUS_TABLE_ID}/${rowId}/?user_field_names=true`;

    const payload = {
      ...data,
      moved_at: new Date().toISOString(),
    };

    const response = await baserowPatch(url, payload);

    return response.data as CaseKanbanStatusRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar status do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const deleteCaseKanbanStatus = async (rowId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(cksTable).where(eq(cksTable.id, rowId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_KANBAN_STATUS_TABLE_ID}/${rowId}/`;

    await baserowDelete(url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao excluir status do Kanban";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("Não foi possível conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisição");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

// Função auxiliar para criar ou atualizar status do caso no Kanban
export const upsertCaseKanbanStatus = async (
  caseId: number,
  institutionId: number,
  columnId: number,
  movedBy?: string,
  notes?: string,
): Promise<CaseKanbanStatusRow> => {
  const existingStatus = await getCaseKanbanStatus(caseId, institutionId);

  if (existingStatus.length > 0) {
    return updateCaseKanbanStatus(existingStatus[0].id, {
      column_id: columnId,
      moved_by: movedBy,
      notes,
    });
  } else {
    return createCaseKanbanStatus({
      case_id: caseId,
      institution_id: institutionId,
      column_id: columnId,
      moved_by: movedBy,
      notes,
    });
  }
};

// Função para inicializar colunas padrão para uma instituição
export const initializeDefaultKanbanColumns = async (
  institutionId: number,
  departmentId?: number | null,
): Promise<KanbanColumnRow[]> => {
  const existingColumns = await getKanbanColumns(institutionId, departmentId);

  if (existingColumns.length > 0) {
    return existingColumns;
  }

  const defaultColumns: CreateKanbanColumnPayload[] = [
    {
      institution_id: institutionId,
      department_id: departmentId ?? null,
      name: "Em Atendimento",
      ordem: 1,
      color: "blue",
      is_default: "sim",
      auto_rule: JSON.stringify({ stages: ["DepoimentoInicial", "EtapaPerguntas"] }),
    },
    {
      institution_id: institutionId,
      department_id: departmentId ?? null,
      name: "Aguardando Revisao",
      ordem: 2,
      color: "amber",
      is_default: "sim",
      auto_rule: JSON.stringify({ stages: ["EtapaFinal"] }),
    },
    {
      institution_id: institutionId,
      department_id: departmentId ?? null,
      name: "Em Andamento",
      ordem: 3,
      color: "purple",
      is_default: "sim",
      auto_rule: null,
    },
    {
      institution_id: institutionId,
      department_id: departmentId ?? null,
      name: "Concluidos Ganhos",
      ordem: 4,
      color: "green",
      is_default: "sim",
      auto_rule: null,
    },
    {
      institution_id: institutionId,
      department_id: departmentId ?? null,
      name: "Concluidos Perdidos",
      ordem: 5,
      color: "red",
      is_default: "sim",
      auto_rule: null,
    },
  ];

  const createdColumns: KanbanColumnRow[] = [];
  for (const column of defaultColumns) {
    const created = await createKanbanColumn(column);
    createdColumns.push(created);
  }

  return createdColumns;
};

// ============================================================================
// CLIENTS (Clientes)
// ============================================================================

const BASEROW_CLIENTS_TABLE_ID =
  Number(
    process.env.NEXT_PUBLIC_BASEROW_CLIENTS_TABLE_ID ||
      process.env.BASEROW_CLIENTS_TABLE_ID,
  ) || 233;

export type ClientRow = {
  id: number;
  nome_completo?: string;
  cpf?: string;
  rg?: string;
  celular?: string;
  email?: string;
  estado_civil?: { id: number; value: string; color: string } | string | null;
  profissao?: string;
  data_nascimento?: string | null;
  nacionalidade?: string;
  endereco_rua?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_estado?: string;
  endereco_cidade?: string;
  institution_id?: number;
  [key: string]: unknown;
};

export type CreateClientPayload = Omit<ClientRow, "id">;
export type UpdateClientPayload = Partial<Omit<ClientRow, "id">>;

// Mapping: Baserow field name → Drizzle column key for clients table
const CLIENT_FIELD_MAP: Record<string, keyof typeof clientsTable.$inferInsert> = {
  nome_completo: "nomeCompleto",
  cpf: "cpf",
  rg: "rg",
  celular: "celular",
  email: "email",
  estado_civil: "estadoCivil",
  profissao: "profissao",
  data_nascimento: "dataNascimento",
  nacionalidade: "nacionalidade",
  endereco_rua: "enderecoRua",
  endereco_numero: "enderecoNumero",
  endereco_complemento: "enderecoComplemento",
  endereco_estado: "enderecoEstado",
  endereco_cidade: "enderecoCidade",
  institution_id: "institutionId",
};

/** Convert Drizzle client row → ClientRow (user_field_names format) */
function mapClientRow(row: typeof clientsTable.$inferSelect): ClientRow {
  return {
    id: row.id,
    nome_completo: row.nomeCompleto ?? undefined,
    cpf: row.cpf ?? undefined,
    rg: row.rg ?? undefined,
    celular: row.celular ?? undefined,
    email: row.email ?? undefined,
    estado_civil: row.estadoCivil ?? undefined,
    profissao: row.profissao ?? undefined,
    data_nascimento: row.dataNascimento?.toISOString().split("T")[0] ?? undefined,
    nacionalidade: row.nacionalidade ?? undefined,
    endereco_rua: row.enderecoRua ?? undefined,
    endereco_numero: row.enderecoNumero ?? undefined,
    endereco_complemento: row.enderecoComplemento ?? undefined,
    endereco_estado: row.enderecoEstado ?? undefined,
    endereco_cidade: row.enderecoCidade ?? undefined,
    institution_id: row.institutionId ? Number(row.institutionId) : undefined,
  };
}

/** Convert ClientRow payload (user_field_names) → Drizzle set/insert object */
function buildClientSetObj(data: Record<string, unknown>): Record<string, unknown> {
  const setObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "id" || value === undefined || value === null || value === "") continue;
    const drizzleKey = CLIENT_FIELD_MAP[key];
    if (!drizzleKey) continue;
    // Handle estado_civil — normalize object {value} to string
    if (key === "estado_civil" && typeof value === "object" && value !== null && "value" in value) {
      setObj[drizzleKey] = (value as { value: string }).value;
    } else if (drizzleKey === "institutionId") {
      setObj[drizzleKey] = String(value);
    } else if (drizzleKey === "dataNascimento") {
      setObj[drizzleKey] = value ? new Date(value as string) : null;
    } else {
      setObj[drizzleKey] = value;
    }
  }
  return setObj;
}

export const getClientById = async (
  rowId: number,
): Promise<ClientRow | null> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      if (!rowId) return null;
      const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, rowId)).limit(1);
      return row ? mapClientRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    if (!rowId) {
      return null;
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CLIENTS_TABLE_ID}/${rowId}/?user_field_names=true`;
    const response = await baserowGet(url, 20000);

    return response.data as ClientRow;
  } catch (error) {
    if (
      (axios.isAxiosError(error) && error.response?.status === 404) ||
      (error instanceof BaserowHttpError && error.status === 404)
    ) {
      return null;
    }
    console.error("Erro ao buscar cliente:", error);
    throw error;
  }
};

export const getClientsByInstitution = async (
  institutionId: number,
): Promise<ClientRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db.select().from(clientsTable)
        .where(eq(clientsTable.institutionId, String(institutionId)));
      return rows.map(mapClientRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CLIENTS_TABLE_ID}/?user_field_names=true&size=200&filter__institution_id__equal=${institutionId}`;
    const response = await baserowGet(url);

    return (response.data as { results?: ClientRow[] })?.results || [];
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    throw error;
  }
};

export const createClient = async (
  payload: CreateClientPayload,
): Promise<ClientRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const insertObj = buildClientSetObj(payload as unknown as Record<string, unknown>);
      const [row] = await db.insert(clientsTable)
        .values(insertObj as typeof clientsTable.$inferInsert)
        .returning();
      return mapClientRow(row);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    // Clean payload - remove empty/undefined values and format fields correctly
    const cleanPayload: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      // Skip undefined, null, or empty string values
      if (value === undefined || value === null || value === "") continue;

      // Handle estado_civil - send just the value string for single_select
      if (key === "estado_civil") {
        if (typeof value === "object" && value !== null && "value" in value) {
          cleanPayload[key] = (value as { value: string }).value;
        } else {
          cleanPayload[key] = value;
        }
      } else {
        cleanPayload[key] = value;
      }
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CLIENTS_TABLE_ID}/?user_field_names=true`;
    const response = await baserowPost(url, cleanPayload);

    return response.data as ClientRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Erro Baserow createClient:", error.response?.data);
      const errorDetail = error.response?.data?.error || error.response?.data?.detail || "";
      const errorMessage =
        error.response?.data?.message || errorDetail || error.message || "Erro ao criar cliente";
      throw new Error(errorMessage);
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const updateClient = async (
  rowId: number,
  payload: UpdateClientPayload,
): Promise<ClientRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj = buildClientSetObj(payload as unknown as Record<string, unknown>);
      if (Object.keys(setObj).length > 0) {
        await db.update(clientsTable).set(setObj).where(eq(clientsTable.id, rowId));
      }
      const [updated] = await db.select().from(clientsTable).where(eq(clientsTable.id, rowId)).limit(1);
      if (!updated) throw new Error(`Client row ${rowId} not found`);
      return mapClientRow(updated);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    // Clean payload - remove empty/undefined values and format fields correctly
    const cleanPayload: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      // Skip undefined, null, or empty string values
      if (value === undefined || value === null || value === "") continue;

      // Handle estado_civil - send just the value string for single_select
      if (key === "estado_civil") {
        if (typeof value === "object" && value !== null && "value" in value) {
          cleanPayload[key] = (value as { value: string }).value;
        } else {
          cleanPayload[key] = value;
        }
      } else {
        cleanPayload[key] = value;
      }
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CLIENTS_TABLE_ID}/${rowId}/?user_field_names=true`;
    const response = await baserowPatch(url, cleanPayload);

    return response.data as ClientRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Erro Baserow updateClient:", error.response?.data);
      const errorDetail = error.response?.data?.error || error.response?.data?.detail || "";
      const errorMessage =
        error.response?.data?.message || errorDetail || error.message || "Erro ao atualizar cliente";
      throw new Error(errorMessage);
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido");
  }
};

export const searchClientByPhone = async (
  phone: string,
  institutionId: number,
): Promise<ClientRow | null> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const cleanPhone = phone.replace(/\D/g, "");
      const rows = await db.select().from(clientsTable)
        .where(
          and(
            like(clientsTable.celular, `%${cleanPhone}%`),
            eq(clientsTable.institutionId, String(institutionId)),
          ),
        )
        .limit(1);
      return rows.length > 0 ? mapClientRow(rows[0]) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    // Clean phone number for search
    const cleanPhone = phone.replace(/\D/g, "");
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CLIENTS_TABLE_ID}/?user_field_names=true&filter__celular__contains=${cleanPhone}&filter__institution_id__equal=${institutionId}`;
    const response = await baserowGet(url, 20000);

    const results = (response.data as { results?: ClientRow[] })?.results || [];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("Erro ao buscar cliente por telefone:", error);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Calendar Events & Guests
// ---------------------------------------------------------------------------

export type CalendarEventRow = {
  id: number;
  InstitutionID?: number | string | null;
  user_id?: number | string | null;
  title?: string | null;
  description?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  timezone?: string | null;
  location?: string | null;
  meeting_link?: string | null;
  reminder_minutes_before?: number | string | null;
  notify_by_email?: boolean | string | null;
  notify_by_phone?: boolean | string | null;
  google_event_id?: string | null;
  sync_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  event_guests?: { id: number; value: string }[];
  [key: string]: unknown;
};

export type CalendarEventGuestRow = {
  id: number;
  event_id?: { id: number; value: string }[];
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notification_status?: "pending" | "sent" | "failed" | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ListCalendarEventsParams = {
  institutionId?: number;
  start?: string;
  end?: string;
  pageSize?: number;
  includeDeleted?: boolean;
};

export type CreateCalendarEventPayload = {
  InstitutionID: number;
  user_id?: number;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location?: string;
  meeting_link?: string;
  reminder_minutes_before?: number;
  notify_by_email?: string;
  notify_by_phone?: string;
  created_at?: string;
  updated_at?: string;
  google_event_id?: string | null;
  sync_status?: string | null;
};

export type UpdateCalendarEventPayload = Partial<
  Omit<CreateCalendarEventPayload, "InstitutionID" | "title" | "start_datetime" | "end_datetime" | "timezone">
> & {
  title?: string;
  start_datetime?: string;
  end_datetime?: string;
  timezone?: string;
  deleted_at?: string | null;
};

export type CreateCalendarEventGuestPayload = {
  event_id: number;
  name: string;
  email?: string;
  phone?: string;
  notification_status?: "pending" | "sent" | "failed";
  created_at?: string;
  updated_at?: string;
};

const ensureCalendarTablesConfigured = (requireGuests = false): void => {
  if (!BASEROW_API_URL) {
    throw new Error("BASEROW_API_URL não configurado");
  }
  if (!BASEROW_EVENTS_TABLE_ID) {
    throw new Error("BASEROW_EVENTS_TABLE_ID não configurado");
  }
  if (requireGuests && !BASEROW_EVENT_GUESTS_TABLE_ID) {
    throw new Error("BASEROW_EVENT_GUESTS_TABLE_ID não configurado");
  }
};

const sanitizePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
};

const toTimestamp = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const sortEvents = (
  events: CalendarEventRow[],
  start?: string,
  end?: string,
): CalendarEventRow[] => {
  const startFilter = start ? toTimestamp(start) : null;
  const endFilter = end ? toTimestamp(end) : null;

  const filtered = events.filter((event) => {
    const eventStart = toTimestamp(event.start_datetime);
    const eventEnd = toTimestamp(event.end_datetime) ?? eventStart;

    if (startFilter !== null && eventEnd !== null && eventEnd < startFilter) {
      return false;
    }

    if (endFilter !== null && eventStart !== null && eventStart > endFilter) {
      return false;
    }

    return true;
  });

  return filtered.sort((a, b) => {
    const aStart = toTimestamp(a.start_datetime) ?? 0;
    const bStart = toTimestamp(b.start_datetime) ?? 0;
    return aStart - bStart;
  });
};

/** Map Drizzle events row → CalendarEventRow */
function mapEventRow(row: typeof eventsTable.$inferSelect): CalendarEventRow {
  return {
    id: row.id,
    InstitutionID: row.institutionID ? Number(row.institutionID) : null,
    user_id: row.userId ? Number(row.userId) : null,
    title: row.title,
    description: row.description,
    start_datetime: row.startDatetime?.toISOString() ?? null,
    end_datetime: row.endDatetime?.toISOString() ?? null,
    timezone: row.timezone,
    location: row.location,
    meeting_link: row.meetingLink,
    reminder_minutes_before: row.reminderMinutesBefore ? Number(row.reminderMinutesBefore) : null,
    notify_by_email: row.notifyByEmail,
    notify_by_phone: row.notifyByPhone,
    google_event_id: row.googleEventId,
    sync_status: row.syncStatus,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    deleted_at: null, // field not in schema-map — will always be null via Drizzle
    event_guests: Array.isArray(row.eventGuests) ? row.eventGuests as { id: number; value: string }[] : [],
  };
}

/** Map Drizzle eventGuests row → CalendarEventGuestRow */
function mapGuestRow(row: typeof eventGuestsTable.$inferSelect): CalendarEventGuestRow {
  return {
    id: row.id,
    event_id: Array.isArray(row.eventId) ? row.eventId as { id: number; value: string }[] : [],
    name: row.name,
    email: row.email,
    phone: row.phone,
    notification_status: row.notificationStatus,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

/** Build Drizzle set object from CreateCalendarEventPayload */
function buildEventSetObj(payload: Record<string, unknown>): Record<string, unknown> {
  const setObj: Record<string, unknown> = {};
  const map: Record<string, string> = {
    InstitutionID: "institutionID",
    user_id: "userId",
    title: "title",
    description: "description",
    start_datetime: "startDatetime",
    end_datetime: "endDatetime",
    timezone: "timezone",
    location: "location",
    meeting_link: "meetingLink",
    reminder_minutes_before: "reminderMinutesBefore",
    notify_by_email: "notifyByEmail",
    notify_by_phone: "notifyByPhone",
    google_event_id: "googleEventId",
    sync_status: "syncStatus",
    created_at: "createdAt",
    updated_at: "updatedAt",
  };
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    const drizzleKey = map[key];
    if (!drizzleKey) continue;
    // Handle type conversions
    if (drizzleKey === "institutionID" || drizzleKey === "userId" || drizzleKey === "reminderMinutesBefore") {
      setObj[drizzleKey] = value != null ? String(value) : null;
    } else if (drizzleKey === "startDatetime" || drizzleKey === "endDatetime" || drizzleKey === "createdAt" || drizzleKey === "updatedAt") {
      setObj[drizzleKey] = value ? new Date(value as string) : null;
    } else {
      setObj[drizzleKey] = value;
    }
  }
  return setObj;
}

export const listCalendarEvents = async (
  params: ListCalendarEventsParams = {},
): Promise<CalendarEventRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const conditions = [];
      if (params.institutionId) {
        conditions.push(eq(eventsTable.institutionID, String(params.institutionId)));
      }
      const rows = await db
        .select()
        .from(eventsTable)
        .where(conditions.length ? and(...conditions) : undefined);
      const mapped = rows.map(mapEventRow);
      // deleted_at is always null from Drizzle, so all events pass !row.deleted_at
      const active = params.includeDeleted ? mapped : mapped.filter((row) => !row.deleted_at);
      return sortEvents(active, params.start, params.end);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured();

    const baseUrl = new URL(
      `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENTS_TABLE_ID}/`,
    );
    baseUrl.searchParams.set("user_field_names", "true");
    baseUrl.searchParams.set("size", String(params.pageSize ?? 200));

    if (params.institutionId) {
      baseUrl.searchParams.set(
        "filter__InstitutionID__equal",
        String(params.institutionId),
      );
    }

    let nextUrl: string | null = baseUrl.toString();
    const results: CalendarEventRow[] = [];

    while (nextUrl) {
      const resp = await baserowGet<BaserowListResponse<CalendarEventRow>>(nextUrl!, 20000);
      const data: BaserowListResponse<CalendarEventRow> = resp.data;

      const pageResults = data?.results ?? [];
      if (Array.isArray(pageResults)) {
        results.push(...(pageResults as CalendarEventRow[]));
      }

      nextUrl = data?.next ?? null;
    }

    if (params.includeDeleted) {
      return sortEvents(results, params.start, params.end);
    }

    const activeEvents = results.filter((row) => !row.deleted_at);
    return sortEvents(activeEvents, params.start, params.end);
  } catch (error) {
    console.error("Erro ao listar eventos:", error);
    throw error;
  }
};

export const getCalendarEventById = async (
  eventId: number,
): Promise<CalendarEventRow | null> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      if (!eventId) return null;
      const [row] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
      return row ? mapEventRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured();
    if (!eventId) {
      return null;
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENTS_TABLE_ID}/${eventId}/?user_field_names=true`;
    const response = await baserowGet(url, 20000);

    return response.data as CalendarEventRow;
  } catch (error) {
    if (
      (axios.isAxiosError(error) && error.response?.status === 404) ||
      (error instanceof BaserowHttpError && error.status === 404)
    ) {
      return null;
    }
    console.error("Erro ao buscar evento:", error);
    throw error;
  }
};

export const createCalendarEvent = async (
  payload: CreateCalendarEventPayload,
): Promise<CalendarEventRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const insertObj = buildEventSetObj(payload as unknown as Record<string, unknown>);
      const [row] = await db.insert(eventsTable).values(insertObj as typeof eventsTable.$inferInsert).returning();
      return mapEventRow(row);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured();
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENTS_TABLE_ID}/?user_field_names=true`;
    const response = await baserowPost(url, sanitizePayload(payload), 20000);

    return response.data as CalendarEventRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail =
        error.response?.data &&
        typeof error.response.data === "object"
          ? JSON.stringify(error.response.data, null, 2)
          : error.response?.data || error.message;
      console.error("Erro Baserow createCalendarEvent:", detail);
    } else {
      console.error("Erro ao criar evento:", error);
    }
    throw error;
  }
};

export const updateCalendarEvent = async (
  eventId: number,
  payload: UpdateCalendarEventPayload,
): Promise<CalendarEventRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const setObj = buildEventSetObj(payload as unknown as Record<string, unknown>);
      // If setObj is empty (e.g., only deleted_at was passed which isn't in schema), fall through to Baserow
      if (Object.keys(setObj).length > 0) {
        await db.update(eventsTable).set(setObj as Partial<typeof eventsTable.$inferInsert>).where(eq(eventsTable.id, eventId));
        const [updated] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
        return mapEventRow(updated);
      }
      return undefined;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured();
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENTS_TABLE_ID}/${eventId}/?user_field_names=true`;
    const response = await baserowPatch(url, sanitizePayload(payload), 20000);

    return response.data as CalendarEventRow;
  } catch (error) {
    console.error("Erro ao atualizar evento:", error);
    throw error;
  }
};

export const softDeleteCalendarEvent = async (
  eventId: number,
  deletedAt: Date = new Date(),
): Promise<CalendarEventRow> => {
  return updateCalendarEvent(eventId, { deleted_at: deletedAt.toISOString() });
};

export const deleteCalendarEvent = async (
  eventId: number,
): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured();
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENTS_TABLE_ID}/${eventId}/`;
    await baserowDelete(url, 20000);
  } catch (error) {
    console.error("Erro ao excluir evento:", error);
    throw error;
  }
};

export const createCalendarEventGuest = async (
  payload: CreateCalendarEventGuestPayload,
): Promise<CalendarEventGuestRow> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const insertObj: typeof eventGuestsTable.$inferInsert = {
        name: payload.name,
        eventId: [{ id: payload.event_id }],
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        notificationStatus: payload.notification_status ?? "pending",
        createdAt: payload.created_at ? new Date(payload.created_at) : new Date(),
        updatedAt: payload.updated_at ? new Date(payload.updated_at) : new Date(),
      };
      const [row] = await db.insert(eventGuestsTable).values(insertObj).returning();
      return mapGuestRow(row);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured(true);
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENT_GUESTS_TABLE_ID}/?user_field_names=true`;
    const body = sanitizePayload({
      ...payload,
      event_id: [payload.event_id],
      notification_status: payload.notification_status ?? "pending",
    });

    const response = await baserowPost(url, body, 20000);

    return response.data as CalendarEventGuestRow;
  } catch (error) {
    console.error("Erro ao criar convidado:", error);
    throw error;
  }
};

export const getCalendarEventGuestById = async (
  guestId: number,
): Promise<CalendarEventGuestRow | null> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      if (!guestId) return null;
      const [row] = await db.select().from(eventGuestsTable).where(eq(eventGuestsTable.id, guestId)).limit(1);
      return row ? mapGuestRow(row) : null;
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured(true);
    if (!guestId) {
      return null;
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENT_GUESTS_TABLE_ID}/${guestId}/?user_field_names=true`;
    const response = await baserowGet(url, 20000);

    return response.data as CalendarEventGuestRow;
  } catch (error) {
    if (
      (axios.isAxiosError(error) && error.response?.status === 404) ||
      (error instanceof BaserowHttpError && error.status === 404)
    ) {
      return null;
    }
    console.error("Erro ao buscar convidado:", error);
    throw error;
  }
};

export const deleteCalendarEventGuest = async (guestId: number): Promise<void> => {
  if (useDirectDb("api")) {
    const _ok = await tryDrizzle(async () => {
      await db.delete(eventGuestsTable).where(eq(eventGuestsTable.id, guestId));
    });
    if (_ok !== undefined) return;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured(true);
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENT_GUESTS_TABLE_ID}/${guestId}/`;
    await baserowDelete(url, 20000);
  } catch (error) {
    console.error("Erro ao excluir convidado:", error);
    throw error;
  }
};

export const listCalendarEventGuests = async (
  eventId: number,
): Promise<CalendarEventGuestRow[]> => {
  if (useDirectDb("api")) {
    const _dr = await tryDrizzle(async () => {
      const rows = await db
        .select()
        .from(eventGuestsTable)
        .where(sql`${eventGuestsTable.eventId}::jsonb @> ${JSON.stringify([{ id: eventId }])}::jsonb`);
      return rows.map(mapGuestRow);
    });
    if (_dr !== undefined) return _dr;
  }

  // --- Baserow fallback ---
  try {
    ensureCalendarTablesConfigured(true);
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_EVENT_GUESTS_TABLE_ID}/?user_field_names=true&filter__event_id__link_row_has=${eventId}`;
    const response = await baserowGet(url, 20000);
    return ((response.data as { results?: CalendarEventGuestRow[] })?.results as CalendarEventGuestRow[]) ?? [];
  } catch (error) {
    console.error("Erro ao listar convidados:", error);
    throw error;
  }
};

import axios from "axios";

import type {
  AuthInfo,
  LoginCredentials,
  OnboardingPayload,
} from "@/lib/validations";

const API_URL =
  process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? "/api/onboarding";
const LOGIN_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_LOGIN_WEBHOOK_URL ??
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
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ||
  process.env.BASEROW_API_KEY ||
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
  (!BASEROW_API_URL || !BASEROW_API_KEY)
) {
  console.error("AVISO: Configuração do Baserow incompleta. Verifique as variáveis de ambiente.");
}

export type BaserowConfigRow = {
  id: number;
  [key: string]: unknown;
};

export const getBaserowConfigs = async (institutionId?: number): Promise<BaserowConfigRow[]> => {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    let results = response.data.results || [];

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
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/${rowId}/?user_field_names=true`;

    const response = await axios.patch(url, data, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    return response.data;
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
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`;

    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    return response.data;
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
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const results = Array.isArray(response.data?.results)
      ? response.data.results
      : [];
    return results as AgentStateRow[];
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

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

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
  [key: string]: unknown;
};

export type GetBaserowCasesParams = {
  institutionId?: number;
  page?: number;
  pageSize?: number;
  fetchAll?: boolean;
};

export type BaserowCasesResponse = {
  results: BaserowCaseRow[];
  totalCount: number;
  hasNextPage: boolean;
};

export const getBaserowCaseById = async (
  rowId: number,
): Promise<BaserowCaseRow | null> => {
  try {
    if (!rowId) {
      return null;
    }

    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/?user_field_names=true`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    return response.data as BaserowCaseRow;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return null;
      }

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

export const getBaserowCases = async ({
  institutionId,
  page = 1,
  pageSize = 50,
  fetchAll = false,
}: GetBaserowCasesParams = {}): Promise<BaserowCasesResponse> => {
  try {
    const buildUrl = (targetPage: number) => {
      const params = new URLSearchParams({
        user_field_names: "true",
        page: String(targetPage),
        size: String(pageSize),
      });
      return `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?${params.toString()}`;
    };

    const shouldFetchAll = Boolean(fetchAll);
    const initialUrl = buildUrl(shouldFetchAll ? 1 : page);

    const allResults: BaserowCaseRow[] = [];
    let nextUrl: string | null = initialUrl;
    let hasNextPage = false;
    let totalCount: number | null = null;

    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Token ${BASEROW_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      const pageResults: BaserowCaseRow[] = response.data?.results || [];
      allResults.push(...pageResults);
      if (typeof response.data?.count === "number") {
        totalCount = response.data.count;
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

    // Filtrar pelo InstitutionID se fornecido
    const shouldFilterByInstitution =
      typeof institutionId === "number" && institutionId !== 4 && allResults.length > 0;

    let results = allResults;
    if (shouldFilterByInstitution) {
      results = allResults.filter((row: BaserowCaseRow) => {
        const rowInstitutionId =
          row.InstitutionID ??
          row["body.auth.institutionId"] ??
          null;
        const hasInstitution =
          rowInstitutionId !== undefined &&
          rowInstitutionId !== null &&
          rowInstitutionId !== "";

        return hasInstitution && String(rowInstitutionId) === String(institutionId);
      });
    }

    return {
      results,
      totalCount: typeof totalCount === "number" ? totalCount : results.length,
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
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/${rowId}/?user_field_names=true`;

    const response = await axios.patch(url, data, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    return response.data;
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

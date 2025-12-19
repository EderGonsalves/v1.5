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

const BASEROW_API_URL = "https://automation-db.riasistemas.com.br/api";
const BASEROW_API_KEY = "jSOTmQbEzFZUOxMSkOs6t5KARjTTaH3S";
const BASEROW_TABLE_ID = 224;

export type BaserowConfigRow = {
  id: number;
  [key: string]: unknown;
};

export const getBaserowConfigs = async (institutionId?: number): Promise<BaserowConfigRow[]> => {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`;
    
    console.log("Buscando configuraÃ§Ãµes do Baserow para institutionId:", institutionId);
    
    // Buscar todas as configuraÃ§Ãµes e filtrar pelo body.auth.institutionId
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log("Resposta completa do Baserow:", JSON.stringify(response.data, null, 2));
    let results = response.data.results || [];
    
    console.log(`Total de linhas retornadas: ${results.length}`);
    
    // Filtrar pelo body.auth.institutionId se fornecido
    // O Baserow retorna campos com nomes como "body.auth.institutionId" (string literal)
    if (institutionId && results.length > 0) {
      results = results.filter((row: BaserowConfigRow) => {
        const rowData = row as Record<string, unknown>;
        
        console.log("Analisando linha:", rowData.id, "Campos:", Object.keys(rowData));
        
        // O Baserow retorna campos com nomes como "body.auth.institutionId" diretamente no objeto
        const rowInstitutionId = rowData["body.auth.institutionId"];
        
        console.log(`Linha ${rowData.id}: institutionId encontrado =`, rowInstitutionId, "Comparando com", institutionId);
        
        // Comparar o institutionId (pode ser string ou nÃºmero)
        const matches = rowInstitutionId === institutionId || 
               Number(rowInstitutionId) === institutionId ||
               String(rowInstitutionId) === String(institutionId);
        
        if (matches) {
          console.log(`âœ“ Linha ${rowData.id} corresponde ao institutionId ${institutionId}`);
        }
        
        return matches;
      });
      
      console.log(`Filtradas ${results.length} configuraÃ§Ãµes para institutionId ${institutionId}`);
    }
    
    return results;
  } catch (error) {
    console.error("Erro ao buscar configuraÃ§Ãµes do Baserow:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Detalhes do erro:", error.response.data);
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao buscar configuraÃ§Ãµes do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("NÃ£o foi possÃ­vel conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisiÃ§Ã£o");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao buscar configuraÃ§Ãµes");
  }
};

export const updateBaserowConfig = async (
  rowId: number,
  data: Partial<BaserowConfigRow>,
): Promise<BaserowConfigRow> => {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_TABLE_ID}/${rowId}/?user_field_names=true`;
    
    console.log("Atualizando linha do Baserow:", rowId, "Dados:", data);
    
    // O Baserow espera os campos com os nomes exatos como "body.auth.institutionId"
    // NÃ£o precisamos transformar nada, apenas enviar os dados como estÃ£o
    const response = await axios.patch(url, data, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log("Linha atualizada com sucesso:", response.data);
    return response.data;
  } catch (error) {
    console.error("Erro ao atualizar configuraÃ§Ã£o do Baserow:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Detalhes do erro:", error.response.data);
        const errorMessage =
          error.response.data?.message || error.message || "Erro ao atualizar configuraÃ§Ã£o do Baserow";
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error("NÃ£o foi possÃ­vel conectar ao Baserow");
      }
      throw new Error(error.message || "Erro ao configurar a requisiÃ§Ã£o");
    }
    throw new Error(error instanceof Error ? error.message : "Erro desconhecido ao atualizar configuraÃ§Ã£o");
  }
};

const BASEROW_CASES_TABLE_ID = 225;

export type BaserowCaseRow = {
  id: number;
  CaseId?: number;
  CustumerName?: string;
  CustumerPhone?: string;
  DepoimentoInicial?: string;
  EtapaPerguntas?: string;
  EtapaFinal?: string;
  Conversa?: string;
  Resumo?: string;
  InstitutionID?: number;
  [key: string]: unknown;
};

export const getBaserowCases = async (institutionId?: number): Promise<BaserowCaseRow[]> => {
  try {
    const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASES_TABLE_ID}/?user_field_names=true`;
    
    console.log("Buscando casos do Baserow para institutionId:", institutionId);
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${BASEROW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log("Resposta completa do Baserow:", JSON.stringify(response.data, null, 2));
    let results = response.data.results || [];
    
    console.log(`Total de casos retornados: ${results.length}`);
    
    // Filtrar pelo InstitutionID se fornecido
    if (institutionId && results.length > 0) {
      results = results.filter((row: BaserowCaseRow) => {
        const rowInstitutionId = row.InstitutionID;
        
        console.log(`Caso ${row.id}: InstitutionID encontrado =`, rowInstitutionId, "Comparando com", institutionId);
        
        // Comparar o institutionId (pode ser string ou número)
        const matches = rowInstitutionId === institutionId || 
               Number(rowInstitutionId) === institutionId ||
               String(rowInstitutionId) === String(institutionId);
        
        if (matches) {
          console.log(`✓ Caso ${row.id} corresponde ao institutionId ${institutionId}`);
        }
        
        return matches;
      });
      
      console.log(`Filtrados ${results.length} casos para institutionId ${institutionId}`);
    }
    
    return results;
  } catch (error) {
    console.error("Erro ao buscar casos do Baserow:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Detalhes do erro:", error.response.data);
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

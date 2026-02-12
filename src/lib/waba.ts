import { getBaserowConfigs, type BaserowConfigRow } from "@/services/api";

const WABA_FIELD_CANDIDATES = [
  "waba_phone_number",
  "body.waba_phone_number",
  "body.tenant.wabaPhoneNumber",
  "body.tenant.phoneNumber",
];

const normalizePhoneValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

export type WabaPhoneInfo = {
  phoneNumber: string;
  configId: number;
  label?: string;
  departmentId?: number | null;
  departmentName?: string | null;
};

/**
 * Retorna TODOS os números WABA de uma instituição.
 * Se a instituição tiver apenas um número, retorna array com um elemento.
 */
export const getInstitutionWabaPhoneNumbers = async (
  institutionId?: number,
): Promise<WabaPhoneInfo[]> => {
  try {
    const configs = await getBaserowConfigs(institutionId);
    if (!configs.length) {
      return [];
    }

    const phoneNumbers: WabaPhoneInfo[] = [];
    const seenPhones = new Set<string>();

    for (const config of configs) {
      const record = config as Record<string, unknown>;

      for (const field of WABA_FIELD_CANDIDATES) {
        const value = record[field];
        if (value === undefined || value === null) {
          continue;
        }

        const normalized = normalizePhoneValue(value);
        if (normalized && !seenPhones.has(normalized)) {
          seenPhones.add(normalized);
          const deptId = record["phone_department_id"];
          const deptName = record["phone_department_name"];
          phoneNumbers.push({
            phoneNumber: normalized,
            configId: config.id,
            label: record["waba_label"] as string | undefined,
            departmentId: typeof deptId === "number" ? deptId : null,
            departmentName: typeof deptName === "string" ? deptName : null,
          });
        }
      }
    }

    return phoneNumbers;
  } catch (error) {
    console.error("[waba] Falha ao buscar números do WhatsApp:", error);
    return [];
  }
};

/**
 * Retorna um mapa telefone → departamento para a instituição.
 * Usado pelo auto-assign para rotear casos pelo número de telefone.
 */
export const getPhoneDepartmentMap = async (
  institutionId?: number,
): Promise<Map<string, { deptId: number; deptName: string }>> => {
  const map = new Map<string, { deptId: number; deptName: string }>();
  try {
    const phones = await getInstitutionWabaPhoneNumbers(institutionId);
    for (const phone of phones) {
      if (phone.departmentId && phone.departmentName) {
        // Normalize: store both raw and digits-only for flexible matching
        map.set(phone.phoneNumber, {
          deptId: phone.departmentId,
          deptName: phone.departmentName,
        });
        const digitsOnly = phone.phoneNumber.replace(/\D/g, "");
        if (digitsOnly !== phone.phoneNumber) {
          map.set(digitsOnly, {
            deptId: phone.departmentId,
            deptName: phone.departmentName,
          });
        }
      }
    }
  } catch (error) {
    console.error("[waba] Falha ao montar mapa telefone→departamento:", error);
  }
  return map;
};

export const getInstitutionWabaPhoneNumber = async (
  institutionId?: number,
): Promise<string | null> => {
  try {
    const configs = await getBaserowConfigs(institutionId);
    if (!configs.length) {
      return null;
    }

    const sortedConfigs = [...configs].sort((a, b) => b.id - a.id);

    for (const config of sortedConfigs) {
      const record = config as Record<string, unknown>;

      for (const field of WABA_FIELD_CANDIDATES) {
        const value = record[field];
        if (value === undefined || value === null) {
          continue;
        }

        const normalized = normalizePhoneValue(value);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("[waba] Falha ao buscar número do WhatsApp:", error);
    return null;
  }
};

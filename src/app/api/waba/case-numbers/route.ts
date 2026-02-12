import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { getRequestAuth } from "@/lib/auth/session";

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ??
  process.env.NEXT_PUBLIC_BASEROW_API_URL ??
  "";

const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ??
  process.env.NEXT_PUBLIC_BASEROW_API_KEY ??
  "";

const BASEROW_CASE_MESSAGES_TABLE_ID =
  Number(
    process.env.BASEROW_CASE_MESSAGES_TABLE_ID ??
      process.env.NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID,
  ) || 0;

type MessageRow = {
  id: number;
  CaseId?: string | number | null;
  from?: string | null;
  to?: string | null;
};

type CaseWabaMap = Record<string, string>;

const normalizePhoneNumber = (
  value: string | number | null | undefined,
): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\D/g, "").trim();
};

const isBrazilianMobile = (num: string): boolean =>
  num.length >= 12 && num.length <= 13 && num.startsWith("55");

/**
 * Busca os números WABA associados a cada caso.
 * Retorna um mapa de CaseId -> wabaPhoneNumber
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 },
      );
    }

    if (!BASEROW_API_URL || !BASEROW_API_KEY || !BASEROW_CASE_MESSAGES_TABLE_ID) {
      return NextResponse.json(
        { error: "config_error", message: "Configuração do Baserow não encontrada" },
        { status: 500 },
      );
    }

    const pageSize = 200;
    const allMessages: MessageRow[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${BASEROW_API_URL}/database/rows/table/${BASEROW_CASE_MESSAGES_TABLE_ID}/?user_field_names=true&size=${pageSize}&page=${page}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Token ${BASEROW_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      const rows: MessageRow[] = response.data?.results || [];
      allMessages.push(...rows);

      hasMore = Boolean(response.data?.next) && rows.length === pageSize;
      page++;

      if (allMessages.length > 10000) {
        break;
      }
    }

    const caseWabaMap: CaseWabaMap = {};

    // Primeira passagem: tenta identificar o WABA analisando pares from/to
    for (const msg of allMessages) {
      if (!msg.CaseId) continue;
      const caseId = String(msg.CaseId);
      if (caseWabaMap[caseId]) continue;

      const from = normalizePhoneNumber(msg.from);
      const to = normalizePhoneNumber(msg.to);

      if (from && to && from !== to) {
        if (isBrazilianMobile(from) && isBrazilianMobile(to)) {
          caseWabaMap[caseId] = to;
        } else if (isBrazilianMobile(from)) {
          caseWabaMap[caseId] = to;
        } else if (isBrazilianMobile(to)) {
          caseWabaMap[caseId] = from;
        }
      }
    }

    // Segunda passagem: usa o primeiro número válido disponível
    for (const msg of allMessages) {
      if (!msg.CaseId) continue;
      const caseId = String(msg.CaseId);
      if (caseWabaMap[caseId]) continue;

      const from = normalizePhoneNumber(msg.from);
      const to = normalizePhoneNumber(msg.to);

      if (from && from.length >= 10) {
        caseWabaMap[caseId] = from;
      } else if (to && to.length >= 10) {
        caseWabaMap[caseId] = to;
      }
    }

    return NextResponse.json({
      caseNumbers: caseWabaMap,
      totalCases: Object.keys(caseWabaMap).length,
    });
  } catch (error) {
    console.error("[waba/case-numbers] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao buscar números WABA dos casos" },
      { status: 500 },
    );
  }
}

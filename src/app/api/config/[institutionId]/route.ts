import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { onboardingPayloadSchema } from "@/lib/validations";

const CONFIG_API_URL =
  process.env.CONFIG_API_URL ||
  "https://automation-webhook.riasistemas.com.br/webhook/onboarding-v2";

type RouteContext = {
  params: Promise<{ institutionId: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { institutionId } = await context.params;

    if (!institutionId) {
      return NextResponse.json(
        { error: "institutionId é obrigatório" },
        { status: 400 },
      );
    }

    console.log("Buscando configuração para institutionId:", institutionId);

    const response = await fetch(
      `${CONFIG_API_URL}/${institutionId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Configuração não encontrada" },
          { status: 404 },
        );
      }
      const errorText = await response.text().catch(() => "Erro desconhecido");
      console.error("Erro ao buscar configuração:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return NextResponse.json(
        { 
          error: "Erro ao buscar configuração",
          details: errorText.includes("Bad Gateway") || errorText.includes("Gateway") 
            ? "Serviço externo indisponível" 
            : errorText.substring(0, 200)
        },
        { status: response.status },
      );
    }

    // Verificar se a resposta é JSON válido
    const contentType = response.headers.get("content-type");
    let data: unknown;
    
    if (contentType?.includes("application/json")) {
      try {
        const text = await response.text();
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Erro ao fazer parse do JSON:", parseError);
        return NextResponse.json(
          { 
            error: "Resposta inválida do servidor",
            details: "O servidor retornou uma resposta que não é JSON válido"
          },
          { status: 502 },
        );
      }
    } else {
      const text = await response.text();
      console.error("Resposta não é JSON:", { contentType, text: text.substring(0, 200) });
      return NextResponse.json(
        { 
          error: "Resposta inválida do servidor",
          details: "O servidor retornou uma resposta que não é JSON"
        },
        { status: 502 },
      );
    }

    console.log("Configuração encontrada:", { institutionId });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Erro ao buscar configuração:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao buscar configuração",
        message:
          error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { institutionId } = await context.params;
    const body = await request.json();

    if (!institutionId) {
      return NextResponse.json(
        { error: "institutionId é obrigatório" },
        { status: 400 },
      );
    }

    console.log("Atualizando configuração para institutionId:", institutionId);

    const parsed = onboardingPayloadSchema.safeParse(body);

    if (!parsed.success) {
      console.error("Erro de validação:", parsed.error.flatten());
      return NextResponse.json(
        {
          error: "invalid_data",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const tenantId = randomUUID();

    console.log("Enviando configuração para webhook com tenantId:", tenantId);
    console.log("Payload validado:", JSON.stringify(payload, null, 2));

    // Adicionar tenantId ao payload antes de enviar (formato esperado pelo webhook)
    const sourcePage =
      request.headers.get("referer") ?? request.nextUrl.pathname ?? "unknown";
    const requestBody = {
      tenantId,
      institutionId: Number(institutionId),
      sourcePage,
      body: payload,
    };

    console.log("Request body completo:", JSON.stringify(requestBody, null, 2));
    console.log("URL do webhook:", CONFIG_API_URL);

    const response = await fetch(CONFIG_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorData: unknown = null;
      
      if (errorText && errorText.trim().length > 0) {
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = errorText;
        }
      }
      
      const errorInfo = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorData,
        hasBody: !!errorData && (typeof errorData === "string" ? errorData.trim().length > 0 : Object.keys(errorData as object).length > 0),
      };
      
      console.error("Erro ao atualizar configuração no webhook:", errorInfo);
      console.error("Request enviado:", {
        url: CONFIG_API_URL,
        method: "POST",
        bodySize: JSON.stringify(requestBody).length,
        tenantId,
        institutionId: payload.auth.institutionId,
      });
      
      // Retornar erro com informações detalhadas
      const errorResponse: {
        error: string;
        status: number;
        details?: unknown;
        message?: string;
      } = {
        error: "Erro ao atualizar configuração no webhook",
        status: response.status,
      };
      
      if (errorData) {
        errorResponse.details = errorData;
        if (typeof errorData === "object" && errorData !== null) {
          const data = errorData as Record<string, unknown>;
          if (data.message) {
            errorResponse.message = String(data.message);
          } else if (data.error) {
            errorResponse.message = String(data.error);
          }
        } else if (typeof errorData === "string") {
          errorResponse.message = errorData;
        }
      } else {
        errorResponse.message = `Webhook retornou status ${response.status} ${response.statusText} sem corpo de resposta`;
      }
      
      return NextResponse.json(errorResponse, { status: response.status });
    }

    // Verificar se a resposta é JSON válido
    const contentType = response.headers.get("content-type");
    let data: unknown;
    
    if (contentType?.includes("application/json")) {
      try {
        const text = await response.text();
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Erro ao fazer parse do JSON:", parseError);
        return NextResponse.json(
          { 
            error: "Resposta inválida do servidor",
            details: "O servidor retornou uma resposta que não é JSON válido"
          },
          { status: 502 },
        );
      }
    } else {
      const text = await response.text();
      console.error("Resposta não é JSON:", { contentType, text: text.substring(0, 200) });
      return NextResponse.json(
        { 
          error: "Resposta inválida do servidor",
          details: text.includes("Bad Gateway") || text.includes("Gateway")
            ? "Serviço externo indisponível (Bad Gateway)"
            : "O servidor retornou uma resposta que não é JSON"
        },
        { status: 502 },
      );
    }

    console.log("Configuração atualizada com sucesso:", { institutionId });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao atualizar configuração",
        message:
          error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}









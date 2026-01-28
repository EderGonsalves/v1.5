import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { onboardingPayloadSchema } from "@/lib/validations";

const CONFIG_API_URL =
  process.env.CONFIG_API_URL ||
  "https://automation-webhook.riasistemas.com.br/webhook/onboarding-v2";

type RouteContext = {
  params: Promise<{ institutionId: string }>;
};

// Função auxiliar para verificar autenticação
const verifyAuth = (request: NextRequest, institutionId: string): { valid: boolean; error?: string } => {
  // Verificar se há um token de autenticação
  const authCookie = request.cookies.get("onboarding_auth");

  if (!authCookie?.value) {
    return { valid: false, error: "Não autenticado" };
  }

  try {
    const authData = JSON.parse(authCookie.value);
    const userInstitutionId = authData?.institutionId;

    // Admin (institutionId 4) pode acessar qualquer instituição
    if (userInstitutionId === 4) {
      return { valid: true };
    }

    // Usuário normal só pode acessar sua própria instituição
    if (String(userInstitutionId) !== String(institutionId)) {
      return { valid: false, error: "Acesso não autorizado a esta instituição" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Token de autenticação inválido" };
  }
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

    // Verificar autenticação
    const auth = verifyAuth(request, institutionId);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 },
      );
    }

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
      return NextResponse.json(
        {
          error: "Erro ao buscar configuração",
          details: errorText.includes("Bad Gateway") || errorText.includes("Gateway")
            ? "Serviço externo indisponível"
            : "Erro ao comunicar com o servidor"
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
      } catch {
        return NextResponse.json(
          {
            error: "Resposta inválida do servidor",
            details: "O servidor retornou uma resposta que não é JSON válido"
          },
          { status: 502 },
        );
      }
    } else {
      return NextResponse.json(
        {
          error: "Resposta inválida do servidor",
          details: "O servidor retornou uma resposta que não é JSON"
        },
        { status: 502 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
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

    // Verificar autenticação
    const auth = verifyAuth(request, institutionId);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 },
      );
    }

    const parsed = onboardingPayloadSchema.safeParse(body);

    if (!parsed.success) {
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

    // Adicionar tenantId ao payload antes de enviar (formato esperado pelo webhook)
    const sourcePage =
      request.headers.get("referer") ?? request.nextUrl.pathname ?? "unknown";
    const requestBody = {
      tenantId,
      institutionId: Number(institutionId),
      sourcePage,
      body: payload,
    };

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
      } catch {
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

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
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





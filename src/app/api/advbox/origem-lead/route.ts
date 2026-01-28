import { NextRequest, NextResponse } from "next/server";

const ADVBOX_API_URL = process.env.ADVBOX_API_URL || "https://app.advbox.com.br/v1";
const ADVBOX_API_TOKEN = process.env.ADVBOX_API_TOKEN;

// Função auxiliar para verificar autenticação
const verifyAuth = (request: NextRequest): { valid: boolean; error?: string } => {
  const authCookie = request.cookies.get("onboarding_auth");

  if (!authCookie?.value) {
    return { valid: false, error: "Não autenticado" };
  }

  try {
    const authData = JSON.parse(authCookie.value);
    if (!authData?.institutionId) {
      return { valid: false, error: "Token de autenticação inválido" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Token de autenticação inválido" };
  }
};

type CreateLeadSourceRequest = {
  name: string;
  description?: string;
  color?: string;
  active?: boolean;
};

export async function POST(request: NextRequest) {
  // Verificar autenticação
  const auth = verifyAuth(request);
  if (!auth.valid) {
    return NextResponse.json(
      { error: auth.error },
      { status: 401 },
    );
  }

  try {
    if (!ADVBOX_API_TOKEN) {
      return NextResponse.json(
        {
          error: "missing_credentials",
          message: "Token da API ADVBOX não configurado. Configure ADVBOX_API_TOKEN no ambiente.",
        },
        { status: 500 },
      );
    }

    const body: CreateLeadSourceRequest = await request.json();

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        {
          error: "invalid_data",
          message: "O nome da origem é obrigatório",
        },
        { status: 400 },
      );
    }

    // Chamar API do ADVBOX para criar origem
    const response = await fetch(`${ADVBOX_API_URL}/lead-sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADVBOX_API_TOKEN}`,
      },
      body: JSON.stringify({
        name: body.name.trim(),
        description: body.description || "",
        color: body.color || "#3b82f6",
        active: body.active !== undefined ? body.active : true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Erro desconhecido");
      return NextResponse.json(
        {
          error: "advbox_api_error",
          message: `Não foi possível criar a origem. Status: ${response.status}`,
          details: errorText.substring(0, 200),
        },
        { status: response.status || 502 },
      );
    }

    const createdSource = await response.json();

    return NextResponse.json(
      {
        success: true,
        data: createdSource,
        message: `Origem "${body.name}" criada com sucesso`,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Verificar autenticação
  const auth = verifyAuth(request);
  if (!auth.valid) {
    return NextResponse.json(
      { error: auth.error },
      { status: 401 },
    );
  }

  try {
    if (!ADVBOX_API_TOKEN) {
      return NextResponse.json(
        {
          error: "missing_credentials",
          message: "Token da API ADVBOX não configurado",
        },
        { status: 500 },
      );
    }

    const response = await fetch(`${ADVBOX_API_URL}/lead-sources`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADVBOX_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Erro desconhecido");
      return NextResponse.json(
        {
          error: "advbox_api_error",
          message: `Não foi possível listar as origens. Status: ${response.status}`,
        },
        { status: response.status || 502 },
      );
    }

    const sources = await response.json();
    return NextResponse.json({ success: true, data: sources }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}










import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { onboardingPayloadSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = onboardingPayloadSchema.safeParse(body);

    if (!parsed.success) {
      console.error("Erro de validação do payload:", parsed.error.flatten());
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
    const automationUrl = process.env.AUTOMATION_ENDPOINT_URL || "https://automation-webhook.riasistemas.com.br/webhook/onboarding-v2";

    console.log("Enviando payload para:", automationUrl);
    console.log("TenantId:", tenantId);

    // Enviar para o webhook de forma assíncrona (não bloqueia a resposta)
    const requestBody = { tenantId, ...payload };
    
    // Fazer a requisição sem bloquear - se falhar, apenas loga o erro
    fetch(automationUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text().catch(() => "Erro desconhecido");
          console.error("Webhook retornou erro:", {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });
        } else {
          const responseData = await response.text().catch(() => null);
          console.log("Webhook respondido com sucesso:", responseData);
        }
      })
      .catch((error) => {
        console.error("Erro ao chamar webhook (não bloqueante):", {
          error: error.message,
          url: automationUrl,
        });
      });

    const ragWorkerEndpoint = process.env.RAG_WORKER_ENDPOINT_URL;
    if (ragWorkerEndpoint && payload.ragFiles.length > 0) {
      Promise.all(
        payload.ragFiles.map((file) =>
          fetch(ragWorkerEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId, file }),
          }).catch((workerError) => {
            console.error("Falha ao encaminhar arquivo RAG", workerError);
          }),
        ),
      ).catch((error) => console.error("Erro ao disparar worker de RAG", error));
    }

    return NextResponse.json({ tenantId }, { status: 201 });
  } catch (error) {
    console.error("Erro ao processar requisição de onboarding:", error);
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}

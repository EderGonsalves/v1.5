/**
 * GET /api/v1/waba/callback
 *
 * Facebook OAuth redirect handler. Receives ?code=...&state={institutionId},
 * processes the full onboarding flow, and returns HTML that sends postMessage
 * to the opener window (popup flow) or redirects back to the app (full redirect flow).
 *
 * Does NOT require auth cookie — the OAuth code is the proof of authorization.
 */
import { NextRequest } from "next/server";
import { processWhatsAppOnboarding } from "@/services/waba-onboarding";

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildCallbackHtml(result: {
  success: boolean;
  phoneNumber?: string;
  error?: string;
  step?: string;
}): string {
  const payload = JSON.stringify({
    type: "whatsapp_connected",
    connected: result.success,
    phoneNumber: result.phoneNumber ?? null,
    error: result.error ?? null,
    step: result.step ?? null,
  });

  const statusHtml = result.success
    ? `<div style="color:#16a34a;font-size:20px;font-weight:600">&#10003; WhatsApp conectado!</div>
       <p style="color:#374151;margin-top:8px">N&uacute;mero: ${result.phoneNumber ?? ""}</p>
       <p style="color:#9ca3af;font-size:13px;margin-top:20px">Fechando automaticamente&hellip;</p>`
    : `<div style="color:#dc2626;font-size:20px;font-weight:600">&#10007; Erro ao conectar</div>
       <p style="color:#374151;margin-top:8px">${escapeHtml(result.error ?? "Erro desconhecido")}</p>
       <p style="color:#9ca3af;font-size:13px;margin-top:20px">Feche esta janela e tente novamente.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WhatsApp - Conex&atilde;o</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;
background:#f9fafb;text-align:center;padding:24px}
</style>
</head>
<body>
<div>${statusHtml}</div>
<script>
(function(){
  var payload=${payload};
  try{
    if(window.opener){
      window.opener.postMessage(payload,'*');
      ${result.success ? "setTimeout(function(){window.close()},2000);" : ""}
    }else{
      window.location.href='/configuracoes/conexoes?waba_connected='+(payload.connected?'1':'0');
    }
  }catch(e){console.error('callback error:',e)}
})();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    const html = buildCallbackHtml({
      success: false,
      error: "Parâmetros inválidos. Código de autorização ou ID da instituição ausentes.",
      step: "validation",
    });
    return new Response(html, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const institutionId = Number(state);
  if (!Number.isFinite(institutionId) || institutionId <= 0) {
    const html = buildCallbackHtml({
      success: false,
      error: "ID da instituição inválido.",
      step: "validation",
    });
    return new Response(html, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const result = await processWhatsAppOnboarding(code, institutionId);

  const html = buildCallbackHtml(result);
  return new Response(html, {
    status: result.success ? 200 : 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

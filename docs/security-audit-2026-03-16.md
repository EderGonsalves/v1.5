# Relatório de Vulnerabilidades — 2026-03-16

## CRÍTICAS (ação imediata)

| # | Vulnerabilidade | Arquivo | Risco |
|---|----------------|---------|-------|
| 1 | **Webhook RIA Sign aceita requests sem HMAC** quando `RIASIGN_WEBHOOK_SECRET` não está configurado | `src/services/riasign.ts:354-358` | Forged webhook events |
| 2 | **URL arbitrária em `window.open()`** — `sign_url` do banco sem validação de protocolo | `src/components/documents/EnvelopeCard.tsx:128` | XSS via `javascript:` URL |
| 3 | **Auth duplicado em localStorage** sem criptografia (além do cookie HttpOnly) | `src/components/onboarding/onboarding-context.tsx` | Token theft via XSS |

## ALTAS

| # | Vulnerabilidade | Arquivo |
|---|----------------|---------|
| 4 | **Media proxy aceita MIME type do cliente** — `?type=text/html` causa XSS | `src/app/api/media/proxy/route.ts:43` |
| 5 | **Baserow proxy não valida HTTP method** — aceita CONNECT, TRACE, etc. | `src/app/api/v1/baserow-proxy/route.ts:62` |
| 6 | **set-session aceita auth do client** sem validação server-side | `src/app/api/v1/auth/set-session/route.ts:12` |
| 7 | **Pacotes com CVEs** — axios (DoS), next (múltiplos), rollup (path traversal) | `package.json` |

## MÉDIAS

| # | Vulnerabilidade | Arquivo |
|---|----------------|---------|
| 8 | **Fail-open em permissões** — erro no fetch libera TODAS as páginas | `src/hooks/use-permissions-status.ts:209` |
| 9 | **Sem rate limiting** em endpoints sensíveis (push/send, cases, users) | Múltiplas rotas |
| 10 | **CSRF via X-Forwarded-Host** — header spoofável sem proxy trust | `src/middleware.ts:36` |
| 11 | **institutionId do cookie não validado contra DB** | `src/app/api/v1/cases/route.ts:76` |
| 12 | **Dados sensíveis em sessionStorage** sem criptografia | Múltiplos hooks |

## BAIXAS / Informacionais

| # | Vulnerabilidade |
|---|----------------|
| 13 | Timing attack em comparação de secrets (usar `crypto.timingSafeEqual`) |
| 14 | Sem CSP header |
| 15 | Sem HSTS header |
| 16 | Cookie sem `Secure` em dev |

## Detalhes Técnicos

### #1 — Webhook RIA Sign sem HMAC
```typescript
// src/services/riasign.ts:354-358
if (!RIASIGN_WEBHOOK_SECRET) {
  console.warn("[riasign] RIASIGN_WEBHOOK_SECRET não configurado — aceitando webhook sem HMAC");
  return true;  // ACEITA SEM VALIDAÇÃO
}
```
**Fix:** Rejeitar webhook quando secret não está configurado (`return false`).

### #2 — URL arbitrária em window.open()
```typescript
// src/components/documents/EnvelopeCard.tsx:128
window.open(signer.sign_url, "_blank", "noopener,noreferrer")
```
**Fix:** Validar protocolo antes de abrir: `if (url.startsWith('https://')) window.open(...)`.

### #3 — Auth em localStorage
```typescript
// src/components/onboarding/onboarding-context.tsx:52, 70, 73
localStorage.setItem("onboarding_auth", JSON.stringify(auth));
```
**Fix:** Remover localStorage auth, usar apenas HttpOnly cookie (`onboarding_auth`).

### #4 — Media proxy MIME type
```typescript
// src/app/api/media/proxy/route.ts:43-49
const mimeType = request.nextUrl.searchParams.get("type") || "application/octet-stream";
// ... usado direto no Content-Type da response
```
**Fix:** Whitelist de MIME types permitidos (`image/*`, `audio/*`, `video/*`, `application/pdf`).

### #5 — Baserow proxy HTTP method
```typescript
// src/app/api/v1/baserow-proxy/route.ts:62
const allowedMethod = method.toUpperCase(); // sem validação
```
**Fix:** Whitelist: `["GET", "POST", "PATCH", "PUT", "DELETE"]`.

### #6 — set-session aceita auth do client
```typescript
// src/app/api/v1/auth/set-session/route.ts:12-14
const auth = await request.json(); // client envia o que quiser
```
**Fix:** Validar auth server-side (checar token contra webhook de autenticação).

### #7 — Pacotes vulneráveis
```
axios         — GHSA-43fc-jf86-j433 (DoS via __proto__)
next          — GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf, GHSA-5f7q-jpqc-wp7h
rollup        — GHSA-mw96-cpmx-2vgc (path traversal)
basic-ftp     — GHSA-5rq4-664w-9x2c (path traversal)
```
**Fix:** `npm audit fix` ou atualizar pacotes manualmente.

### #8 — Fail-open em permissões
```typescript
// src/hooks/use-permissions-status.ts:209
// Em caso de erro, libera TODAS as páginas (ALL_FEATURE_PATHS)
```
**Fix:** Fail-secure — negar acesso a todas as páginas em caso de erro.

### #9 — Sem rate limiting
Apenas `/api/v1/auth/login` tem rate limiting. Endpoints como `/api/v1/push/send`, `/api/v1/cases`, `/api/v1/users` não têm.
**Fix:** Implementar rate limiting em todos os endpoints state-changing.

### #10 — CSRF via X-Forwarded-Host
```typescript
// src/middleware.ts:36, 46-48
// Validação CSRF depende de x-forwarded-host que pode ser spoofado
```
**Fix:** Validar que header vem de proxy confiável ou usar double-submit cookie.

### #11 — institutionId não validado contra DB
```typescript
// src/app/api/v1/cases/route.ts:76-79
// Filtra por auth.institutionId do cookie — se cookie for adulterado, acessa outra instituição
```
**Fix:** Validar institutionId contra tabela de usuários no banco.

### #12 — Dados sensíveis em sessionStorage
Hooks `use-case-chat.ts`, `use-conversations.ts`, `use-permissions-status.ts` armazenam dados completos de casos/mensagens em sessionStorage sem criptografia.
**Fix:** Armazenar apenas IDs/timestamps, não dados completos.

### #13 — Timing attack
```typescript
// src/services/codilo.ts:268
if (webhookSecret !== CODILO_WEBHOOK_SECRET) // comparação vulnerável
```
**Fix:** Usar `crypto.timingSafeEqual()`.

### #14-16 — Headers de segurança
**Fix:** Adicionar no middleware:
- `Content-Security-Policy`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Secure` flag no cookie em todos os ambientes

## Prioridade de Correção

1. **Imediato:** #1, #2, #4, #5 (fáceis, alto impacto)
2. **Curto prazo:** #3, #6, #7, #8 (requerem refactor moderado)
3. **Médio prazo:** #9, #10, #11, #12 (infraestrutura)
4. **Backlog:** #13, #14, #15, #16 (hardening)

# Análise: Mensagens Duplicadas no Webhook

**Data:** 30/01/2026
**Status:** Monitoramento (problema não reproduzido consistentemente)

---

## Resumo

Investigação sobre mensagens do chat chegando duplicadas no webhook externo.

---

## Arquitetura do Fluxo de Mensagens

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  ChatComposer   │────▶│  useCaseChat     │────▶│  API Route      │────▶│   Webhook    │
│  (UI)           │     │  (Hook)          │     │  (POST)         │     │  (Externo)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └──────────────┘
                                                         │
                                                         ▼
                                                 ┌─────────────────┐
                                                 │    Baserow      │
                                                 │  (case_messages)│
                                                 └─────────────────┘
```

### Arquivos Envolvidos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/components/chat/ChatComposer.tsx` | UI de composição de mensagem |
| `src/components/chat/CaseChatView.tsx` | Container do chat |
| `src/hooks/use-case-chat.ts` | Hook de gerenciamento de estado e API |
| `src/app/api/cases/[caseId]/messages/route.ts` | Endpoint POST que dispara webhook |
| `src/lib/chat/baserow.ts` | Integração com Baserow |

---

## Fluxo Detalhado do Envio

### 1. Frontend (ChatComposer.tsx)

```typescript
// Linha 120-140
const handleSend = async () => {
  if (!hasContent || disabled || isSending) {
    return;  // Proteção contra envio sem conteúdo ou durante envio
  }
  // ... monta payload e chama onSend
};
```

**Proteções existentes:**
- Verifica `isSending` antes de enviar
- Desabilita botão durante envio

### 2. Hook (use-case-chat.ts)

```typescript
// Linha 125-130
const sendMessage = useCallback(async (payload) => {
  if (isSendingRef.current) {
    return null;  // Proteção com ref síncrono
  }
  isSendingRef.current = true;
  // ... envia mensagem
}, []);
```

**Proteções existentes:**
- `isSendingRef` (ref síncrono) para evitar chamadas concorrentes
- Estado `isSending` para UI

### 3. API Route (route.ts)

```typescript
// Linha 459-468
if (wabaPhoneNumber && customerPhone && content) {
  const webhookPayload = {
    display_phone_number: wabaPhoneNumber,
    to: customerPhone,
    text: content,
    DataHora: formatDateTimeBR(now),
  };
  await dispatchChatWebhook(webhookPayload);
}
```

**Proteções existentes:**
- Nenhuma verificação de idempotência

---

## Possíveis Causas de Duplicação

### 1. React StrictMode (Desenvolvimento)

- Next.js habilita `reactStrictMode: true` por padrão
- Em desenvolvimento, causa dupla execução de efeitos
- **Verificar:** Testar se ocorre em produção

### 2. Condição de Corrida no Frontend

- Usuário pressiona Enter + clica no botão simultaneamente
- A verificação `isSending` usa estado React (assíncrono)
- Segunda chamada pode passar antes do estado atualizar

### 3. Retry Automático de Rede

- Navegador pode fazer retry se requisição demorar
- Timeout do webhook é 20 segundos (`CHAT_WEBHOOK_TIMEOUT_MS`)

### 4. Ausência de Idempotency Key

- Requisição não inclui identificador único
- Mesma requisição enviada duas vezes = duas chamadas ao webhook

### 5. Polling Interferindo

- Hook faz polling a cada 10 segundos
- Pode haver interação inesperada com estado

---

## Soluções Recomendadas

### Solução 1: Idempotency Key (Recomendada)

Adicionar identificador único para evitar processamento duplicado:

**Frontend (ChatComposer ou hook):**
```typescript
const messageId = crypto.randomUUID();
formData.append("idempotencyKey", messageId);
```

**Backend (route.ts):**
```typescript
const idempotencyKey = formData.get("idempotencyKey");
// Verificar em cache/banco se já foi processado
// Se sim, retornar resposta anterior
// Se não, processar e armazenar resultado
```

### Solução 2: Debounce no Frontend

```typescript
import { useMemo } from "react";
import debounce from "lodash/debounce";

const handleSend = useMemo(() =>
  debounce(async () => {
    // ... lógica de envio
  }, 300, { leading: true, trailing: false })
, [onSend]);
```

### Solução 3: Mutex no Hook

```typescript
const sendingMutex = useRef<Promise<unknown> | null>(null);

const sendMessage = useCallback(async (payload) => {
  if (sendingMutex.current) {
    return sendingMutex.current;  // Retorna promise existente
  }

  sendingMutex.current = (async () => {
    try {
      // ... lógica de envio
    } finally {
      sendingMutex.current = null;
    }
  })();

  return sendingMutex.current;
}, []);
```

### Solução 4: Logs para Diagnóstico

Adicionar logs temporários para identificar a causa:

```typescript
// Em route.ts, antes do dispatchChatWebhook
console.log("[webhook] Disparando:", {
  timestamp: new Date().toISOString(),
  requestId: crypto.randomUUID(),
  customerPhone,
  contentHash: Buffer.from(content).toString("base64").slice(0, 20),
});
```

---

## Configurações Relevantes

### Variáveis de Ambiente

```env
CHAT_WEBHOOK_URL=<url do webhook externo>
CHAT_WEBHOOK_TOKEN=<token de autenticação>
CHAT_WEBHOOK_TIMEOUT_MS=20000
NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS=10000
```

### Next.js Config

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  // reactStrictMode não está explícito (default: true)
};
```

---

## Status e Próximos Passos

- [x] Análise do código realizada
- [x] Possíveis causas identificadas
- [ ] Monitorar se problema volta a ocorrer
- [ ] Se recorrer: adicionar logs para diagnóstico
- [ ] Implementar solução definitiva (idempotency key)

---

## Referências

- Arquivos analisados:
  - `src/components/chat/ChatComposer.tsx`
  - `src/components/chat/CaseChatView.tsx`
  - `src/hooks/use-case-chat.ts`
  - `src/app/api/cases/[caseId]/messages/route.ts`
  - `src/lib/chat/baserow.ts`
  - `next.config.ts`

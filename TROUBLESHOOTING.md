# Troubleshooting - Erro "Bad Gateway"

## Problema

Erro: `Unexpected token 'B', "[Bad Gateway]" is not valid JSON`

Este erro ocorre quando a aplicação tenta fazer parse de uma resposta que não é JSON válido, geralmente quando um serviço externo retorna um erro HTTP (como 502 Bad Gateway) em formato HTML/texto.

## Causa

O erro acontece em duas situações principais:

1. **API Routes fazendo fetch para webhooks externos**: Quando o webhook externo retorna um erro (502, 503, etc.) em formato HTML/texto, o código tenta fazer `response.json()` e falha.

2. **Serviço não está pronto**: O Traefik pode estar tentando acessar a aplicação antes dela estar completamente inicializada.

## Soluções Implementadas

### 1. Tratamento de Erro nas API Routes

As rotas `/api/config/[institutionId]` agora verificam:
- Se o `Content-Type` é `application/json` antes de fazer parse
- Se a resposta contém "Bad Gateway" e retorna mensagem apropriada
- Tratamento de erro mais robusto com mensagens claras

### 2. Tratamento de Erro no Cliente

O serviço `api.ts` agora:
- Verifica o `Content-Type` da resposta antes de processar
- Detecta respostas "Bad Gateway" e retorna mensagem amigável
- Trata erros de conexão de forma mais clara

### 3. Healthcheck Melhorado

O healthcheck no `stack.yml` foi ajustado para:
- Verificar se a resposta JSON é válida
- Aguardar mais tempo antes de começar a verificar (60s)
- Validar o conteúdo da resposta, não apenas o status code

## Como Verificar

### 1. Verificar Logs do Container

```bash
docker service logs onboarding-app_onboarding-app --tail 50
```

Procure por:
- Erros de parse JSON
- Respostas "Bad Gateway"
- Erros de conexão com webhooks

### 2. Verificar Status do Serviço

```bash
docker service ps onboarding-app_onboarding-app
```

Verifique se os containers estão rodando e saudáveis.

### 3. Testar Healthcheck Manualmente

```bash
docker exec -it <container_id> node -e "require('http').get('http://localhost:3000/api/health', (r) => {let data='';r.on('data',(c)=>{data+=c});r.on('end',()=>{try{const json=JSON.parse(data);console.log(json);process.exit(json.status==='ok'?0:1)}catch(e){console.error('Erro:',e);process.exit(1)}})}).on('error',(e)=>{console.error('Erro:',e);process.exit(1)})"
```

### 4. Verificar Conectividade com Webhooks

Verifique se os webhooks externos estão acessíveis:

```bash
curl -X POST https://automation-webhook.riasistemas.com.br/webhook/login-v2 \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

## Prevenção

### 1. Timeouts Adequados

Certifique-se de que os timeouts estão configurados:
- API Routes: 30-60 segundos
- Cliente: 30 segundos

### 2. Retry Logic

Para requisições críticas, considere implementar retry logic:

```typescript
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 3. Validação de Resposta

Sempre valide o `Content-Type` antes de fazer parse:

```typescript
const contentType = response.headers.get("content-type");
if (!contentType?.includes("application/json")) {
  const text = await response.text();
  throw new Error(`Resposta não é JSON: ${text.substring(0, 100)}`);
}
```

## Variáveis de Ambiente Importantes

Certifique-se de que estas variáveis estão configuradas no `stack.yml`:

```yaml
environment:
  - NODE_ENV=production
  - NEXT_PUBLIC_ONBOARDING_API_URL=/api/onboarding
  - NEXT_PUBLIC_LOGIN_WEBHOOK_URL=https://automation-webhook.riasistemas.com.br/webhook/login-v2
  - CONFIG_API_URL=https://automation-webhook.riasistemas.com.br/webhook/onboarding-v2
  - AUTOMATION_ENDPOINT_URL=https://automation-webhook.riasistemas.com.br/webhook/onboarding-v2
```

## Próximos Passos

Se o erro persistir:

1. Verifique se os webhooks externos estão funcionando
2. Aumente o `start_period` do healthcheck
3. Verifique se há problemas de rede no Docker Swarm
4. Considere adicionar circuit breaker para serviços externos


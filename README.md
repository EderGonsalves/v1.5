# Onboarding multi-etapas

Fluxo em Next.js + shadcn/ui para coletar dados de novos tenants, validar
cada etapa com react-hook-form/zod e enviar tudo para o fluxo de automacao. Os
arquivos enviados para RAG são hospedados localmente (em
`public/rag-uploads`) apenas até que um worker externo gere embeddings e
salve nas suas bases vetoriais.

## Requisitos

- Node 20+

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste de acordo com seu ambiente:

```bash
cp .env.example .env
```

- `NEXT_PUBLIC_ONBOARDING_API_URL`: endpoint usado no frontend (padrão:
  `/api/onboarding`);
- `AUTOMATION_ENDPOINT_URL`: URL da sua automação principal (recebe o payload completo);
- `RAG_WORKER_ENDPOINT_URL`: endpoint opcional para processar anexos e gerar embeddings.
- `BASEROW_CASE_MESSAGES_TABLE_ID`/`NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID`: tabela do Baserow onde cada mensagem do caso será persistida.
- `CHAT_WEBHOOK_URL`/`CHAT_WEBHOOK_TOKEN`: destino que recebe a mensagem antes dela ser salva; use token se o webhook exigir autenticação.
- `CHAT_WEBHOOK_TIMEOUT_MS`/`NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS`: controlam o timeout do webhook e o intervalo de atualização automática do chat (milissegundos).

## Chat de casos

- `/casos/[caseId]/chat` abre a nova tela estilo WhatsApp com:
  - histórico estruturado (`GET /api/cases/:id/messages`);
  - envio de texto, anexos e áudios (usa `POST /api/cases/:id/messages`);
  - indicador da janela de 24h do WhatsApp e botão para pausar/retomar o bot.
- O modal de casos também ganhou um atalho **Abrir chat** para cada linha.
- Sempre configure a tabela de mensagens no Baserow + webhook antes de usar a tela para garantir que as mensagens sejam sincronizadas com o bot.

## Follow-up automǭtico

- `/follow-up` permite configurar atǸ 10 mensagens por institui��ǜo, definindo ordem, tempo de espera, dias/horǭrios permitidos e status de ativa��ǜo.
- As configura����es ficam nas tabelas `BASEROW_FOLLOW_UP_CONFIG_TABLE_ID` e `BASEROW_FOLLOW_UP_HISTORY_TABLE_ID` (veja `.env.example`).
- Agende uma chamada peri��dica para `POST /api/follow-up/check` (via cron/N8N). O endpoint:
  - ignora casos finalizados, busca o ǧltimo contato do cliente e calcula se jǭ Ǹ hora de enviar a pr��xima mensagem ativa;
  - dispara o webhook configurado em `CHAT_WEBHOOK_URL` usando o telefone do escrit��rio retornado pelo Baserow;
  - registra sucesso/erro no hist��rico para evitar mensagens duplicadas e respeitar o limite de 10 mensagens a cada 24h.
- Para valida��ǜes manuais existe `GET /api/follow-up/check?institution_id=42`, que lista quantas mensagens ativas est��o prontas para envio.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. O wizard mantém todo o estado no frontend
e, ao finalizar, faz `POST /api/onboarding`, que valida os dados e
replica a mesma carga para os endpoints configurados.

## Teste de UX

Existe um teste automatizado com Vitest + Testing Library simulando o
fluxo completo do wizard (preenche cada etapa e valida a mensagem de
sucesso). Rode:

```bash
npm run test
# ou modo watch
npm run test:watch
```

## Lint

```bash
npm run lint
```

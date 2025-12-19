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

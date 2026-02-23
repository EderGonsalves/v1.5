# Plano de Integração — AdvBox API (Busca Processual)

> **Status:** Planejado, não implementado
> **Data:** 2026-02-23

## Contexto

O sistema já possui um módulo de acompanhamento processual via **Codilo API** (OAuth2, monitoramento diário + consulta avulsa assíncrona via webhook). O usuário quer adicionar a **API AdvBox** (`GET https://app.advbox.com.br/api/v1/lawsuits`) como fonte complementar de busca processual, permitindo pesquisar processos por número CNJ diretamente na AdvBox.

**Diferenças chave:**
- **Codilo:** Assíncrona (envia query → resultado chega via webhook → cria movements)
- **AdvBox:** Síncrona (GET com filtros → resposta imediata com dados do processo)

Já existe uma rota AdvBox parcial em `src/app/api/advbox/origem-lead/route.ts` usando `ADVBOX_API_TOKEN` como env var global.

## API AdvBox — Lawsuits

- **URL:** `GET https://app.advbox.com.br/api/v1/lawsuits`
- **Auth:** `Authorization: Bearer <JWT>`
- **Paginação:** `limit` (default 25, max 100) + `offset`
- **Filtros úteis:**
  - `process_number` — busca exata por número do processo (CNJ)
  - `identification` — CPF/CNPJ do cliente
  - `name` — busca textual por nome
  - `customer_id` — ID do cliente na AdvBox
- **Resposta:** `{ totalCount, limit, offset, data: [{ id, process_number, protocol_number, folder, process_date, type, group, responsible, stage, step, customers }] }`

## Arquitetura da Integração

### Abordagem: Busca Complementar no LawsuitTab

Adicionar um botão "Buscar na AdvBox" no `LawsuitTab` que faz uma busca síncrona por `process_number` (CNJ) e exibe os resultados inline. Não substitui o Codilo — complementa.

## Arquivos a Criar/Modificar

### 1. Novo Service: `src/services/advbox.ts`
Serviço server-side para comunicação com a API AdvBox.

```typescript
// Tipos
export type AdvBoxLawsuit = {
  id: number;
  process_number: string;
  protocol_number: string;
  folder: string;
  process_date: string;
  type: { id: number; name: string };
  group: { id: number; name: string };
  responsible: { id: number; name: string };
  stage: { id: number; name: string };
  step: { id: number; name: string };
  customers: Array<{ id: number; name: string; identification: string }>;
};

export type AdvBoxLawsuitsResponse = {
  totalCount: number;
  limit: number;
  offset: number;
  data: AdvBoxLawsuit[];
};

// Funções
export async function searchAdvBoxLawsuits(
  token: string,
  params: { process_number?: string; identification?: string; name?: string; limit?: number; offset?: number }
): Promise<AdvBoxLawsuitsResponse>
```

- Usa `ADVBOX_API_URL` (env, default `https://app.advbox.com.br/api/v1`)
- Recebe token como parâmetro (permite per-institution no futuro)
- Fallback para `ADVBOX_API_TOKEN` env var global

### 2. Nova Rota API: `src/app/api/v1/lawsuit/advbox/route.ts`
Rota proxy para buscar processos na AdvBox.

- **GET** `?process_number=XXX&identification=YYY&name=ZZZ&limit=25&offset=0`
- Auth obrigatória via `getRequestAuth()`
- Busca token AdvBox: primeiro tenta campo `advbox_api_token` na Config 224 (per-institution), fallback para env var `ADVBOX_API_TOKEN`
- Retorna dados formatados da AdvBox

### 3. Novo Client Wrapper: Adicionar em `src/services/lawsuit-client.ts`

```typescript
export async function searchAdvBox(params: {
  processNumber?: string;
  identification?: string;
  name?: string;
}): Promise<AdvBoxLawsuit[]>
```

### 4. Modificar UI: `src/components/lawsuit/LawsuitTab.tsx`

Adicionar seção "Busca AdvBox" **abaixo** do card de status existente e **acima** da timeline de movimentações:

- Quando o tracking já existe (CNJ preenchido), mostrar botão "Buscar na AdvBox"
- Ao clicar, faz GET com o CNJ do tracking atual
- Exibe resultados em cards compactos: tipo, grupo, responsável, etapa, clientes
- Se não houver tracking, permitir busca manual por CNJ/CPF/nome

### 5. Novo Componente: `src/components/lawsuit/AdvBoxResults.tsx`

Componente para exibir resultados da AdvBox em formato de card:
- Número do processo, data, tipo, grupo
- Responsável, etapa atual
- Lista de clientes (nome + CPF/CNPJ)
- Estado: loading, empty, error, results

## Credenciais

- **Imediato:** Usar `ADVBOX_API_TOKEN` como env var global (mesmo padrão do `origem-lead/route.ts` existente)
- **Futuro:** Adicionar campo `advbox_api_token` na tabela Config (224) para suporte per-institution
- Na rota, tentar per-institution primeiro, fallback para env var global

## Ordem de Implementação

1. **`src/services/advbox.ts`** — Service com tipos e função de busca
2. **`src/app/api/v1/lawsuit/advbox/route.ts`** — Rota API (GET)
3. **`src/services/lawsuit-client.ts`** — Adicionar `searchAdvBox()`
4. **`src/components/lawsuit/AdvBoxResults.tsx`** — Componente de resultados
5. **`src/components/lawsuit/LawsuitTab.tsx`** — Integrar botão + resultados

## Verificação

1. Configurar `ADVBOX_API_TOKEN` no `.env`
2. Abrir um caso com tracking ativo → clicar "Buscar na AdvBox"
3. Verificar que resultados aparecem com dados do processo
4. Testar com CNJ que não existe na AdvBox → mensagem "Nenhum resultado"
5. Testar sem token configurado → mensagem de erro clara

# Relatório de Otimização Baserow — 2026-02-24

## Contexto

Análise dos logs do Baserow após migração do app Next.js para PostgreSQL direto (Drizzle ORM).
O tráfego restante no Baserow é de **sistemas externos** (N8N/automações), não do nosso app.

---

## Diagnóstico

**Nenhuma das requisições observadas é do app Next.js.**

Evidências:
- Nenhuma URL contém `user_field_names=true` (nosso app sempre usa)
- Nenhuma URL filtra por `InstitutionID` (nosso app sempre filtra)
- Filtros usam `field_XXXX` (IDs crus) — padrão do node Baserow do N8N
- `POST /api/user/token-auth/` antes de cada operação — N8N re-autentica a cada chamada
- `GET /api/database/fields/table/*/` — N8N busca metadata antes de cada query

---

## 3 Problemas Identificados

### 1. Tabela 225 (Cases) — 11 requisições sequenciais paginadas (~5s)

```
21:55:05 → page=9   filter__field_1688__empty=&filter__field_1693__empty=
21:55:07 → page=10
...
21:55:10 → page=19
```

- `field_1688` = `EtapaFinal`, `field_1693` = `IApause`
- Filtro: buscar casos com EtapaFinal vazio E IApause vazio (casos ativos)
- ~1900 linhas sendo puxadas via REST paginado (100 por página)
- Isso é um **workflow N8N** que varre todos os casos ativos

### 2. Tabelas 117, 151, 174, 4 — sistemas externos

- Não existem no nosso app (nossas tabelas são 219-257)
- São de outro workspace/database no Baserow ou de automações legadas
- Cada operação faz: `token-auth` → `fields/table/X` → query/insert — 3 requests mínimos

### 3. Overhead de autenticação + schema por request

- 6x `POST /api/user/token-auth/` em 60 segundos
- 5x `GET /api/database/fields/table/*/` em 60 segundos
- N8N não cacheia nem token nem metadata

---

## Recomendações de Otimização

### Alta Prioridade

1. **Confirmar `USE_DIRECT_DB=true` em produção**
   - Elimina 100% dos requests do nosso app ao Baserow
   - Verificar: `echo $USE_DIRECT_DB` no container Next.js

2. **Migrar workflow N8N da tabela 225 para PostgreSQL direto**
   - Elimina as 11+ requests paginadas (~5s → 1 query <20ms)
   - Opção A: Usar nó PostgreSQL no N8N com query direta:
     ```sql
     SELECT * FROM database_table_225
     WHERE field_1688 IS NULL AND field_1693 IS NULL;
     ```
   - Opção B: Criar endpoint API no Next.js para N8N consumir (ver abaixo)

### Média Prioridade

3. **Criar endpoint `/api/v1/automation/active-cases`**
   - N8N faz 1 request ao nosso app (Drizzle) em vez de 11+ ao Baserow
   - Retorna casos ativos filtrados server-side
   - Exemplo de implementação:
     ```typescript
     // src/app/api/v1/automation/active-cases/route.ts
     import { db } from "@/lib/db";
     import { cases } from "@/lib/db/schema/cases";
     import { isNull } from "drizzle-orm";

     export async function GET(req: Request) {
       // Validar API key de automação
       const rows = await db.select().from(cases)
         .where(and(isNull(cases.etapaFinal), isNull(cases.iApause)));
       return Response.json(rows);
     }
     ```

4. **Migrar workflows N8N das tabelas 117/151/174/4 para nó PostgreSQL**
   - Elimina overhead de token-auth + fields discovery por request
   - Investigar quais workflows usam essas tabelas no painel N8N

### Baixa Prioridade

5. **Reduzir memória do container Baserow (4GB → 1-2GB)**
   - Após confirmar que tráfego do app está em zero
   - Libera recursos para outros containers
   - Baserow continua como UI admin (uso esporádico)

---

## Referência: Mapeamento de Campos

| Field ID | Nome | Tabela |
|----------|------|--------|
| field_1688 | EtapaFinal | 225 (Cases) |
| field_1693 | IApause | 225 (Cases) |
| field_1715 | (followUpConfig filter) | 229 (FollowUpConfig) |

## Arquivos Relacionados

- `src/lib/db/index.ts` — conexão pool Drizzle
- `src/lib/db/schema/cases.ts` — schema da tabela 225
- `scripts/create-indices.sql` — índices para PostgreSQL
- `scripts/apply-indices.ts` — script para aplicar índices

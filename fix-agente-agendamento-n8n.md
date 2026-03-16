# Fix: Agente de Finalização não respeita horários da agenda (v2)

## Problema

Usuários reportam que o agente de finalização (N8N) não respeita os horários definidos na agenda. O agente oferece horários errados ou cria eventos no horário incorreto.

## Causa Raiz

5 problemas identificados no fluxo N8N:

1. **Tool `verificarhabilitado1` redundante** — já resolvido pelo `Set Agenda Data`, mas instrui o LLM a guardar um `user_id` que pode ser diferente do round-robin
2. **`institutionId` como `$fromAI`** nas tools `consultadisponibilidade1` e `cadastrarevento1` — LLM pode passar valor errado
3. **LLM fazendo aritmética de timezone** — "some 3 horas" é frágil, LLMs erram contas
4. **`start_datetime` sem indicador de timezone** — LLM pode interpretar como UTC em vez de Brasília
5. **Instruções contraditórias** no prompt sobre `user_id`

---

## Fix 1: Remover tool `verificarhabilitado1` (CRÍTICO)

**Por quê:** O passo 1 do prompt já resolve via template se a agenda está habilitada (`Set Agenda Data` → `agenda_habilitada`). A tool instrui o LLM a "guardar o `user_id` do resultado" — que pode ser DIFERENTE do `agenda_user_id` do round-robin (`next-assignee`).

**Ação:**
1. Deletar o nó `verificarhabilitado1` do fluxo
2. Remover a conexão `ai_tool` desse nó para o `Agente Finalização`
3. Remover a seção `<ferramenta_1>` do system prompt (ver Fix 5)

---

## Fix 2: Hardcodar `institutionId` no `consultadisponibilidade1` (CRÍTICO)

**Por quê:** O parâmetro `institutionId` usa `$fromAI()`, o que significa que o LLM decide que valor enviar. Se errar, a consulta retorna horários de outra instituição ou falha.

**Ação no nó `consultadisponibilidade1`:**

Alterar o query parameter `institutionId` de:
```
={{ $fromAI('parameters0_Value', '', 'string') }}
```

Para:
```
={{ $('Busca-Info-Do-Escritorio3').item.json['body.auth.institutionId'] }}
```

---

## Fix 3: Hardcodar `x-institution-id` no `cadastrarevento1` (CRÍTICO)

**Por quê:** Mesmo problema do Fix 2 — o header `x-institution-id` usa `$fromAI()`.

**Ação no nó `cadastrarevento1`:**

Alterar o header `x-institution-id` de:
```
={{ $fromAI('parameters0_Value', '', 'string') }}
```

Para:
```
={{ $('Busca-Info-Do-Escritorio3').item.json['body.auth.institutionId'] }}
```

---

## Fix 4: Usar `start_datetime_utc` / `end_datetime_utc` (DEPLOY NECESSÁRIO)

**Por quê:** Antes, o endpoint `/api/v1/calendar/availability` retornava `start_datetime` em horário local (ex: `2026-03-14T09:00:00` — sem `Z`), e o LLM tinha que somar 3 horas manualmente para converter para UTC. LLMs erram contas com frequência.

**O que mudou no código (a deployar):**

O endpoint agora retorna dois campos novos em cada slot:

```json
{
  "date": "2026-03-14",
  "day_label": "sexta-feira",
  "start": "09:00",
  "end": "09:30",
  "start_datetime": "2026-03-14T09:00:00",
  "end_datetime": "2026-03-14T09:30:00",
  "start_datetime_utc": "2026-03-14T12:00:00Z",
  "end_datetime_utc": "2026-03-14T12:30:00Z"
}
```

Os campos `start` / `end` / `start_datetime` / `end_datetime` continuam em horário local (Brasília) para exibição ao cliente.

Os campos `start_datetime_utc` / `end_datetime_utc` estão em UTC, prontos para usar direto no `cadastrarevento`.

**Ação no nó `cadastrarevento1` — atualizar a toolDescription:**

De:
```
start_datetime (string ISO 8601 UTC com Z, ex: "2026-02-15T17:00:00Z" — horário de Brasília +3h)
```

Para:
```
start_datetime (string ISO 8601 UTC com Z — use o valor EXATO do campo start_datetime_utc retornado por consultadisponibilidade, SEM nenhuma conversão de fuso horário), end_datetime (string ISO 8601 UTC com Z — use o valor EXATO do campo end_datetime_utc retornado por consultadisponibilidade, SEM nenhuma conversão)
```

---

## Fix 5: Atualizar o System Prompt do `Agente Finalização`

### 5a. Remover `<ferramenta_1>` inteira

Deletar este bloco do system prompt:
```xml
<ferramenta_1 nome="verificarhabilitado">
Parâmetros: institutionId: "..."
Limite: MÁXIMO 1 chamada.
Importante: Guarde o campo user_id do primeiro resultado (results[0].user_id) para usar nas próximas ferramentas.
</ferramenta_1>
```

### 5b. Atualizar `<ferramenta_2>` (consultadisponibilidade)

Remover referência ao `institutionId` (agora hardcoded no nó) e mencionar os campos UTC:
```xml
<ferramenta_2 nome="consultadisponibilidade">
Parâmetros:
  - userId: (valor FIXO, já configurado no sistema)
Limite: MÁXIMO 1 chamada.
Importante: O retorno inclui campos start_datetime_utc e end_datetime_utc já em UTC. Use esses valores diretamente ao cadastrar eventos. Use start/end (horário local) para exibir ao cliente.
</ferramenta_2>
```

### 5c. Atualizar `<ferramenta_3>` (cadastrarevento)

```xml
<ferramenta_3 nome="cadastrarevento">
Header x-institution-id: já configurado automaticamente.
Body JSON DEVE incluir user_id com valor FIXO: {{ $('Set Agenda Data').item.json.agenda_user_id }} (NÃO altere este número).
IMPORTANTE: Use start_datetime_utc e end_datetime_utc do slot escolhido DIRETAMENTE como start_datetime e end_datetime no body. NÃO some horas, NÃO converta fuso horário.
Limite: MÁXIMO 1 chamada.
</ferramenta_3>
```

### 5d. Atualizar `<passo_4>` — Remover instrução de somar 3 horas

Substituir:
```
- start_datetime: start_datetime do slot + 3 horas + Z
- end_datetime: end_datetime do slot + 3 horas + Z
```

Por:
```
- start_datetime: copie o valor EXATO de start_datetime_utc do slot escolhido (NÃO converta, NÃO some horas)
- end_datetime: copie o valor EXATO de end_datetime_utc do slot escolhido (NÃO converta, NÃO some horas)
```

### 5e. Atualizar `<regras_de_formato>`

Substituir:
```
- Horários da consultadisponibilidade já estão em Brasília — SEM conversão.
- Horários para cadastrarevento: Brasília +3h com sufixo Z.
```

Por:
```
- Horários exibidos ao cliente (campos start/end) estão em Brasília — use para mostrar ao cliente.
- Horários para cadastrarevento: use start_datetime_utc / end_datetime_utc DIRETAMENTE, sem nenhuma conversão.
- NUNCA some ou subtraia horas dos horários. Os campos _utc já estão no formato correto.
```

---

## Resumo das Mudanças

| # | O quê | Onde | Impacto |
|---|-------|------|---------|
| 1 | Remover `verificarhabilitado1` | Nó N8N + prompt | Elimina user_id conflitante |
| 2 | Hardcodar `institutionId` em `consultadisponibilidade1` | Nó N8N | Impede consulta na instituição errada |
| 3 | Hardcodar `x-institution-id` em `cadastrarevento1` | Nó N8N | Impede criação em instituição errada |
| 4 | Usar campos `_utc` | Código (deploy) + nó N8N | Elimina aritmética de timezone do LLM |
| 5 | Limpar prompt | System prompt do agente | Remove instruções contraditórias |

---

## Deploy

O código do endpoint `/api/v1/calendar/availability` já foi alterado no arquivo `src/app/api/v1/calendar/availability/route.ts`. Após deploy, os novos campos `start_datetime_utc` e `end_datetime_utc` estarão disponíveis. As mudanças são **retrocompatíveis** — os campos antigos continuam funcionando.

Mudanças nos nós N8N (Fixes 1-3) e no system prompt (Fix 5) devem ser feitas diretamente no editor do N8N.

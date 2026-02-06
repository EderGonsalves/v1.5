# Changelog

Todas as alterações notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.2.0] - 2026-02-02

### Adicionado

#### Sistema de Follow-up Automático

Sistema para envio de mensagens automáticas de follow-up para clientes que ainda não finalizaram o atendimento.

**Novos arquivos:**
- `src/app/follow-up/page.tsx` - Página de configuração de mensagens de follow-up

**Arquivos modificados:**
- `src/services/api.ts` - Adicionadas funções CRUD para follow-up:
  - `getFollowUpConfigs(institutionId?)` - Lista configurações
  - `createFollowUpConfig(data)` - Cria configuração
  - `updateFollowUpConfig(rowId, data)` - Atualiza configuração
  - `deleteFollowUpConfig(rowId)` - Remove configuração
  - `getFollowUpHistory(caseId?, institutionId?)` - Lista histórico
  - `createFollowUpHistory(data)` - Cria registro de histórico
  - `updateFollowUpHistory(rowId, data)` - Atualiza registro

- `src/components/Header.tsx` - Adicionado link "Follow-up" no menu

**Variáveis de ambiente:**
- `BASEROW_FOLLOW_UP_CONFIG_TABLE_ID=229`
- `BASEROW_FOLLOW_UP_HISTORY_TABLE_ID=230`
- `NEXT_PUBLIC_BASEROW_FOLLOW_UP_CONFIG_TABLE_ID=229`
- `NEXT_PUBLIC_BASEROW_FOLLOW_UP_HISTORY_TABLE_ID=230`

**Tabela de Configuração no Baserow (ID: 229):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `institution_id` | Number | ID da instituição |
| `message_order` | Number | Ordem da mensagem (1-10) |
| `delay_minutes` | Number | Tempo de espera em minutos após última mensagem do cliente |
| `message_content` | Text | Conteúdo da mensagem |
| `is_active` | Text | "sim" ou "não" |
| `allowed_days` | Text | Dias permitidos (ex: "seg,ter,qua,qui,sex") |
| `allowed_start_time` | Text | Horário início (ex: "08:00") |
| `allowed_end_time` | Text | Horário fim (ex: "18:00") |
| `created_at` | DateTime | Data de criação |
| `updated_at` | DateTime | Última atualização |

**Tabela de Histórico no Baserow (ID: 230):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `case_id` | Number | ID do caso |
| `institution_id` | Number | ID da instituição |
| `config_id` | Number | ID da configuração usada |
| `message_order` | Number | Ordem da mensagem enviada |
| `customer_phone` | Text | Telefone do cliente |
| `message_sent` | Text | Conteúdo enviado |
| `sent_at` | DateTime | Data/hora do envio |
| `status` | Text | "success" ou "failed" |
| `error_message` | Text | Mensagem de erro (se houver) |
| `last_client_message_at` | DateTime | Última mensagem do cliente |

**Funcionamento:**
1. As mensagens são enviadas do número do escritório (WhatsApp conectado)
2. Cada mensagem é enviada após o tempo de espera desde a última interação do cliente
3. Mensagens só são enviadas nos dias e horários configurados
4. Clientes que já atingiram a etapa final não recebem follow-up
5. Máximo de 10 mensagens por cliente

---

## [1.1.3] - 2026-02-02

### Corrigido

- Ajustado `src/app/conexoes/page.tsx` para ler/gravar o campo `webhook_active`, garantindo que o toggle de alerta realmente atualize o status na tabela 228.
- `handleSaveWebhook()` agora converte o switch booleano em `webhook_active: "sim" | "não"`, evitando o envio de `is_active` inexistente.
- `handleToggleWebhookActive()` e a listagem da tabela passaram a utilizar `webhook_active`, garantindo exibição condizente com o banco.
- `src/services/api.ts` atualizou o payload de criação para popular `webhook_active`, mantendo consistência com o backend.

---

## [1.1.2] - 2026-02-02

### Alterado

#### Campo is_active de boolean para texto

- Campo `is_active` na tabela 228 alterado de `boolean` para `text`
- Valores aceitos: "sim", "não" (e variações como "yes", "true", "1", "ativo")
- Atualizado tipo `WebhookRow.is_active` para `string`
- Atualizado tipo `CreateWebhookPayload.is_active` para `string`
- Adicionada função `isWebhookActive()` para converter texto em booleano na UI
- Atualizado `handleSaveWebhook()` para enviar "sim"/"não"
- Atualizado `handleToggleWebhookActive()` para alternar entre "sim"/"não"
- Atualizado `handleOpenWebhookDialog()` para converter texto em booleano ao carregar
- Atualizada renderização da lista de webhooks para usar `isWebhookActive()`

---

## [1.1.1] - 2026-02-02

### Alterado

#### Campo de identificação do webhook

- Renomeado campo `InstitutionID` para `webhoock_institution_id` na tabela de webhooks (228)
- Atualizado tipo `WebhookRow` em `src/services/api.ts`
- Atualizado tipo `CreateWebhookPayload` em `src/services/api.ts`
- Atualizado filtro em `getWebhooks()` para usar o novo campo
- Atualizado `src/app/conexoes/page.tsx` para enviar o campo correto

---

## [1.1.0] - 2026-02-02

### Adicionado

#### Sistema de Alertas de Casos

Sistema para enviar notificações via webhook quando casos mudam de etapa (Depoimento Inicial, Etapa de Perguntas, Etapa Final).

**Novos arquivos:**
- `src/lib/alerts/types.ts` - Tipos TypeScript para o sistema de alertas
- `src/lib/alerts/alert-service.ts` - Serviço para construção de payloads e envio de alertas
- `src/lib/alerts/index.ts` - Export do módulo de alertas
- `src/app/api/alerts/route.ts` - API para disparo manual de alertas

**Arquivos modificados:**
- `src/services/api.ts` - Adicionadas funções CRUD para webhooks:
  - `getWebhooks(institutionId?)` - Lista webhooks
  - `createWebhook(data)` - Cria webhook
  - `updateWebhook(rowId, data)` - Atualiza webhook
  - `deleteWebhook(rowId)` - Remove webhook
  - Adicionado campo `last_alert_stage` no tipo `BaserowCaseRow`

- `src/app/conexoes/page.tsx` - Nova seção "Webhooks de Alertas":
  - Listagem de webhooks cadastrados
  - Formulário para adicionar/editar webhook
  - Toggle para ativar/desativar webhook
  - Seleção de etapas que disparam alertas
  - Botões de editar e excluir

**Variáveis de ambiente:**
- `BASEROW_WEBHOOKS_TABLE_ID=228`
- `NEXT_PUBLIC_BASEROW_WEBHOOKS_TABLE_ID=228`

**Tabela no Baserow (ID: 228):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `webhoock_institution_id` | Number | ID da instituição que cadastrou o webhook |
| `webhook_url` | Text | URL do endpoint |
| `webhook_name` | Text | Nome identificador |
| `webhook_secret` | Text | Chave secreta (opcional) |
| `alert_depoimento_inicial` | Boolean | Alertar nesta etapa |
| `alert_etapa_perguntas` | Boolean | Alertar nesta etapa |
| `alert_etapa_final` | Boolean | Alertar nesta etapa |
| `is_active` | Boolean | Webhook ativo |
| `created_at` | DateTime | Data de criação |
| `updated_at` | DateTime | Última atualização |
| `last_triggered_at` | DateTime | Último disparo |
| `last_status` | Text | "success" ou "failed" |

**Campo adicionado na tabela de casos (ID: 225):**
- `last_alert_stage` - Armazena a última etapa alertada

#### Integração com Baserow Webhooks

O sistema foi projetado para funcionar com webhooks nativos do Baserow:

1. Baserow detecta alteração na tabela de casos
2. Baserow envia POST para `https://automation-webhook.riasistemas.com.br/webhook/alertas-v2`
3. N8N processa e busca webhooks da tabela 228
4. N8N envia payload para cada webhook ativo do cliente

**Payload enviado aos webhooks do cliente:**
```json
{
  "alertType": "DepoimentoInicial | EtapaPerguntas | EtapaFinal",
  "triggeredAt": "2026-02-02T10:30:00.000Z",
  "case": {
    "id": 123,
    "caseId": 456,
    "bjCaseId": "BJ789",
    "customerName": "João Silva",
    "customerPhone": "5511999999999",
    "institutionId": 1,
    "createdAt": "2026-02-01",
    "stages": {
      "depoimentoInicial": true,
      "etapaPerguntas": false,
      "etapaFinal": false
    },
    "summary": "Resumo do caso...",
    "isPaused": false
  },
  "metadata": {
    "source": "ria-onboarding",
    "version": "1.0.0"
  }
}
```

### API Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `POST /api/alerts` | POST | Dispara alerta manualmente para um caso |

**Payload do POST /api/alerts:**
```json
{
  "caseId": 123,
  "alertType": "DepoimentoInicial | EtapaPerguntas | EtapaFinal",
  "institutionId": 1
}
```

---

## [1.0.0] - Versão inicial

### Funcionalidades existentes

- Onboarding de instituições
- Dashboard de configurações
- Página de casos com listagem e filtros
- Chat integrado por caso
- Estatísticas de casos por etapa
- Conexão com WhatsApp Business (OAuth)
- Integração com Baserow para persistência

# Plano de implementação do chat de casos

Este guia descreve as configurações, dependências e etapas necessárias para evoluir o histórico de conversas em um chat estilo WhatsApp, permitindo o envio de novas mensagens a partir do modal dos casos.

## 1. Arquitetura alvo

1. **Persistência estruturada**  
   - Criar uma tabela dedicada às mensagens (`case_messages`) para evitar conciliar tudo em um único campo de texto.  
   - Manter o campo `Conversa` da tabela de casos como cache/legado: toda nova mensagem também é anexada no formato textual atual para não quebrar telas antigas.

2. **Fluxo de envio**  
   - Front envia uma nova mensagem (`caseId`, `sender`, `content`) para um endpoint interno.  
   - O endpoint envia o texto ao webhook externo (responsável por entregar via WhatsApp/Bot).  
   - Em caso de sucesso, grava a mensagem na tabela `case_messages` e atualiza o registro do caso (campo `Conversa`).  
   - Retorna os dados persistidos para o front renderizar instantaneamente.

3. **Leitura**  
   - A UI consulta `GET /api/cases/{caseId}/messages` (que lê diretamente `case_messages`).  
   - Para compatibilidade, se a tabela ainda estiver vazia, parsear o campo `Conversa` existente e popular a lista inicial.

## 2. Configurações necessárias

### 2.1 Banco de dados

Exemplo de DDL (ajuste nomes de schema/tipos conforme o banco real):

```sql
CREATE TABLE case_messages (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES baserow_cases(id),
  sender VARCHAR(32) NOT NULL CHECK (sender IN ('cliente', 'agente', 'sistema')),
  content TEXT NOT NULL,
  direction VARCHAR(16) NOT NULL DEFAULT 'outbound',
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  webhook_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_messages_case_id ON case_messages(case_id);
```

### 2.2 Variáveis de ambiente

- `NEXT_PUBLIC_CHAT_WEBHOOK_URL` – endpoint externo que realizará o envio da mensagem.  
- `CHAT_WEBHOOK_TOKEN` (ou similar) – caso o webhook exija autenticação.  
- `CASE_MESSAGES_TABLE_ID` – se continuar usando Baserow, informar o ID da tabela de mensagens. Caso use banco próprio, ajustar os serviços para o client adequado.

### 2.3 Serviços (backend)

- Criar funções em `src/services/api.ts` ou módulo dedicado (`src/services/case-chat.ts`) com operações:
  - `fetchCaseMessages(caseId)` → busca mensagens estruturadas.  
  - `appendCaseMessage(params)` → chama webhook, grava na tabela e retorna o registro.  
  - `syncConversationField(caseId)` → opcional, reescreve `Conversa` concatenando todas as mensagens ordenadas.

### 2.4 Rotas Next.js

Adicionar rotas em `src/app/api/cases/[caseId]/messages`:

- `GET` – delega para `fetchCaseMessages`.  
- `POST` – valida payload, chama `appendCaseMessage`, devolve a mensagem persistida.  
- (Opcional) `POST /sync` – força a atualização do campo `Conversa` a partir da nova tabela.

### 2.5 UI / Estado

- Implementar um hook `useCaseChat(caseId)` que:
  - busca a lista inicial (`GET /messages`),
  - expõe `sendMessage` para chamar o `POST` e atualizar o estado local,
  - realiza pooling opcional ou integra WebSocket/SSE no futuro.

- Atualizar o modal dos casos:
  - Substituir a aba “Conversa” por um componente `CaseChatPanel` com layout de chat (lista + input).  
  - Manter a aba “Resumo” intacta.

## 3. Roteiro de implementação

1. **Definir o armazenamento**  
   - Confirmar se a nova tabela ficará no Baserow ou em outro banco.  
   - Criar o schema (DDL acima) e expor credenciais via `.env`.

2. **Serviços + rotas API**  
   - Implementar os métodos de busca/envio das mensagens.  
   - Integrar o webhook (utilizar `axios` com timeout + retries).  
   - Garantir logging de sucesso/erro e persistir a resposta do webhook para auditoria.

3. **Sincronização com campo legado**  
   - Criar utilitário que converte uma lista de mensagens em texto (`Cliente: ... \n Agente: ...`).  
   - Ao salvar uma nova mensagem, usar `updateBaserowCase` para atualizar `Conversa`.  
   - Opcional: job para migrar conversas antigas para a nova tabela (parsing do texto atual).

4. **Interface do chat**  
   - Hook `useCaseChat` + novo componente visual (similar a apps de mensagens, com autoscroll, estado de envio etc.).  
   - Input com validação (limite de caracteres, aviso caso webhook falhar).  
   - Atualizar o modal para usar o novo componente na aba “Conversa” e manter fallback para conversas antigas (parse do texto legado, se `case_messages` vazio).

5. **Testes e validação**  
   - Cobrir parsing (legado → estruturado) e serialização (estruturado → texto).  
   - Testar os fluxos: envio bem-sucedido, falha no webhook, reconexão/pooling.  
   - Validar UX com casos reais (mensagens longas, emojis, anexos futuros).

## 4. Considerações adicionais

- **Concorrência**: se múltiplos atendentes puderem enviar mensagens simultaneamente, implementar locks otimistas (usando `updated_at`) ou utilizar fila.  
- **Histórico completo**: armazenar a resposta do webhook e eventual ID retornado pelo provedor permite reprocessar entregas.  
- **Auditoria**: registrar quem enviou a mensagem (usuário logado) no campo `sender_metadata` ou similar.  
- **Escalabilidade**: caso o volume cresça, migrar o storage para uma base específica de mensagens e apenas sincronizar com o Baserow para visualização.

Seguindo este roteiro, o modal de casos passa a comportar um chat em tempo real, preservando o histórico existente e permitindo envios via webhook dentro da mesma estrutura de dados.

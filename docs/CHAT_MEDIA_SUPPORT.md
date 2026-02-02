# Suporte a Mídia no Chat

Este documento descreve as implementações de suporte a imagens, áudios e documentos no sistema de chat.

## Visão Geral

O chat suporta envio e recebimento de:
- **Imagens**: Exibidas inline com modal para visualização ampliada
- **Áudios**: Player de áudio nativo
- **Documentos**: Download direto ao clicar

## Estrutura da Tabela de Mensagens (Baserow)

Tabela: `case_messages` (ID: 227)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | number | ID único da mensagem |
| `CaseId` | string | Identificador do caso |
| `Sender` | select | Remetente (cliente, usuário, bot, agente) |
| `DataHora` | datetime | Data e hora da mensagem |
| `Message` | text | Conteúdo textual da mensagem |
| `file` | file[] | Arquivos anexados |
| `from` | string | Número de telefone do remetente |
| `to` | string | Número de telefone do destinatário |
| `messages_type` | string | Tipo da mensagem (text, image, audio, document, video) |
| `imageId` | string | ID/nome do arquivo de imagem |
| `audioid` | string | ID/nome do arquivo de áudio |
| `documentId` | string | ID/nome do documento |

## Payload do Webhook

Ao enviar mensagens, o webhook recebe o seguinte payload:

```json
{
  "display_phone_number": "número WABA da empresa",
  "to": "número do cliente",
  "text": "conteúdo da mensagem",
  "DataHora": "DD/MM/YYYY HH:mm",
  "field": "chat",
  "messages_type": "text | image | audio | document | video",
  "imageId": "nome_arquivo.jpg",
  "audioid": "nome_arquivo.ogg",
  "documentId": "nome_arquivo.pdf"
}
```

### Campos por tipo de mensagem:
- **Texto**: `messages_type: "text"` (sem IDs adicionais)
- **Imagem**: `messages_type: "image"` + `imageId`
- **Áudio**: `messages_type: "audio"` + `audioid`
- **Documento**: `messages_type: "document"` + `documentId`
- **Vídeo**: `messages_type: "video"`

## Determinação do Remetente (Sender)

A lógica de determinação de quem enviou a mensagem segue esta prioridade:

### Prioridade 1: Campos `from` e `to`
- Se `from` = telefone do cliente → mensagem do **Cliente** (exibida à esquerda)
- Se `to` = telefone do cliente → mensagem do **Bot/Empresa** (exibida à direita)

### Prioridade 2: Campo `Sender` (fallback)
Usado apenas quando não há `customerPhone` disponível:

| Valor no Baserow | Normalizado para | Posição |
|------------------|------------------|---------|
| cliente, client, customer | Cliente | Esquerda |
| usuario, usuário, user, bot, sistema, system, assistant | Bot | Direita |
| agente, agent, atendente | Agente | Direita |

## Comportamento da Interface

### Imagens
1. **Miniatura**: Exibida na mensagem com efeito de hover "Clique para ampliar"
2. **Modal**: Ao clicar, abre modal fullscreen com:
   - Imagem ampliada
   - Botão de download
   - Botão de fechar (X)
   - Tecla ESC para fechar
   - Clique fora da imagem fecha o modal
   - Nome do arquivo na parte inferior

### Documentos
1. Exibidos com ícone de documento
2. Nome do arquivo e tamanho
3. Texto "Clique para baixar"
4. Ao clicar, inicia download em segundo plano

### Áudios
1. Player de áudio nativo do navegador
2. Controles de play/pause/volume

## Arquivos Modificados

### `src/lib/chat/types.ts`
- Adicionados campos `messageType`, `audioId`, `imageId`, `documentId` ao tipo `CaseMessage`

### `src/lib/chat/baserow.ts`
- Adicionados campos `messages_type`, `audioid`, `imageId`, `documentId` ao tipo `BaserowCaseMessageRow`
- Função `inferSenderFromPhoneFields`: determina sender pelos campos from/to
- Função `extractSenderValue`: extrai valor do sender de diferentes formatos
- Função `normalizeSender`: normaliza valores de sender para tipos conhecidos
- Função `createCaseMessageRow`: inclui novos campos ao criar mensagem

### `src/app/api/cases/[caseId]/messages/route.ts`
- Tipo `ChatWebhookPayload` com campos de mídia
- Lógica para determinar `messages_type` baseado no arquivo
- Extração de `imageId`, `audioid`, `documentId` dos arquivos enviados

### `src/components/chat/ChatMessageList.tsx`
- Componente `ImageModal`: modal para visualização de imagens
- Componente `ImageAttachment`: miniatura clicável de imagens
- Componente `DocumentAttachment`: card de documento com download
- Função `forceDownload`: força download de arquivos via blob

### `next.config.ts`
- Adicionado domínio `automation-db.riasistemas.com.br` para imagens remotas

## Configuração de Ambiente

```env
# Tabela de mensagens do chat
BASEROW_CASE_MESSAGES_TABLE_ID=227
NEXT_PUBLIC_BASEROW_CASE_MESSAGES_TABLE_ID=227
```

## Fluxo de Envio de Mensagem

1. Usuário seleciona arquivo(s) no `ChatComposer`
2. Arquivos são enviados via `FormData` para `/api/cases/[caseId]/messages`
3. API faz upload dos arquivos para o Baserow
4. Determina `messages_type` baseado no MIME type
5. Extrai ID do arquivo (nome) para `imageId`, `audioid` ou `documentId`
6. Dispara webhook com payload completo (se configurado)
7. Cria registro na tabela `case_messages` do Baserow
8. Retorna mensagem criada para exibição imediata

## Fluxo de Recebimento de Mensagem

1. Cliente acessa chat, dispara GET `/api/cases/[caseId]/messages`
2. API busca mensagens da tabela `case_messages`
3. Para cada mensagem:
   - Determina sender pelos campos `from`/`to` (comparando com `customerPhone`)
   - Normaliza attachments da coluna `file`
   - Define direção: cliente = esquerda, bot/agente = direita
4. Retorna lista de mensagens ordenadas por data
5. Frontend exibe mensagens com componentes apropriados por tipo

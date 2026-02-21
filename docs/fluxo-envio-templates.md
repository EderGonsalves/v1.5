# Fluxo de Envio de Templates WhatsApp (com fix meta_template)

## Exemplo: template `boas_vindas` com body: "Olá {{1}}, bem-vindo ao escritório {{2}}!"

Variáveis preenchidas: `{{1}}` = "João", `{{2}}` = "Silva Advogados"

---

## Fluxo passo a passo

### 1. TemplateSendDialog (client)

Monta `components` e envia para a API:
```json
{
  "caseId": 123,
  "to": "5511999999999",
  "templateName": "boas_vindas",
  "templateLanguage": "pt_BR",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "João" },
        { "type": "text", "text": "Silva Advogados" }
      ]
    }
  ],
  "wabaPhoneNumber": "5511888888888"
}
```

### 2. route.ts (API) — constrói o `meta_template`

Como `components` tem itens, inclui a chave `components`:
```json
"meta_template": {
  "name": "boas_vindas",
  "language": { "code": "pt_BR" },
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "João" },
        { "type": "text", "text": "Silva Advogados" }
      ]
    }
  ]
}
```

E `first_body_text` = `"João"` (para o log no Baserow).

### 3. N8N EnviaMensagem (com a mudança)

O `JSON.stringify` resolve o `meta_template` e o body final enviado à Meta fica:
```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "template",
  "template": {
    "name": "boas_vindas",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João" },
          { "type": "text", "text": "Silva Advogados" }
        ]
      }
    ]
  }
}
```

Formato exato que a Meta espera — **todas as variáveis** são enviadas corretamente.

### 4. N8N Create a row (log Baserow)

Usa `first_body_text` = "João" para gravar na tabela de mensagens.

---

## Comparação: COM vs SEM variáveis

| Cenário | `meta_template` | O que Meta recebe |
|---------|----------------|-------------------|
| **Com variáveis** | Inclui `components` com todos os parâmetros | Template com substituições corretas |
| **Sem variáveis** | Só `name` + `language` (sem `components`) | Template simples, sem erro |
| **Header + Body** | Inclui ambos os components (header e body) | Cada variável no componente certo |

A diferença chave: antes o N8N **sempre** enviava `components` com 1 parâmetro hardcoded. Agora o app monta o objeto completo e o N8N só repassa — funciona para 0, 1, 2 ou N variáveis, em qualquer componente.

---

## Mudanças necessárias no N8N

### 1. Nó "EnviaMensagem" — trocar o JSON body para:
```json
{
  "messaging_product": "whatsapp",
  "to": "{{ $json.To }}",
  "type": "template",
  "template": {{ JSON.stringify($('Webhook').item.json.body.meta_template) }}
}
```

### 2. Nó "Edit Fields" — trocar campo `text` para:
```
{{ $('Webhook').item.json.body.first_body_text }}
```

### 3. Nó "EnviaMensagem" — remover espaço no final da URL

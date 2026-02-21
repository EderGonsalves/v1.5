# Guia: Corrigir Upload de Documentos no N8N

## Problema
Arquivos do WhatsApp são salvos no MinIO sem Content-Type e sem extensão, fazendo o navegador baixar um arquivo binário em vez de exibir o conteúdo.

---

## Alteração 1: Nó "Upload a file3" (S3) — Adicionar Content-Type

1. Clique no nó **"Upload a file3"**
2. No campo **File Name**, troque:
   ```
   {{ $json.id }}
   ```
   Para:
   ```
   {{ $json.id }}.{{ $item("0").$node["Download media"].json["mime_type"].split("/").pop() }}
   ```
3. Clique em **Additional Fields** → **Add Field** → **Content Type**
4. No campo Content Type, coloque:
   ```
   {{ $item("0").$node["Download media"].json["mime_type"] }}
   ```

**Antes:**
```
fileName: 1234567890
Content-Type: (vazio → application/octet-stream)
```

**Depois:**
```
fileName: 1234567890.pdf
Content-Type: application/pdf
```

---

## Alteração 2: Nó "Edit Fields" — Extensão na URL

1. Clique no nó **"Edit Fields"**
2. No campo **imagem_url**, troque:
   ```
   https://s3-automation.riasistemas.com.br/browser/imagens/{{ $item("0").$node["Download media"].json["id"] }}
   ```
   Para:
   ```
   https://s3-automation.riasistemas.com.br/browser/imagens/{{ $item("0").$node["Download media"].json["id"] }}.{{ $item("0").$node["Download media"].json["mime_type"].split("/").pop() }}
   ```

**Antes:** `.../imagens/1234567890`
**Depois:** `.../imagens/1234567890.pdf`

---

## Alteração 3: Nó "Create a row" — Adicionar CaseId (opcional mas recomendado)

1. Clique no nó **"Create a row"**
2. Clique em **Add Field**
3. Selecione o campo com **Field ID: 1701** (CaseId)
4. No valor, coloque:
   ```
   {{ $('Webhook').item.json.body.caseId }}
   ```

Sem isso, a mensagem do documento não fica vinculada ao caso correto.

---

## Como testar

1. Salve o workflow no N8N
2. Envie um documento (PDF, imagem, etc.) pelo WhatsApp para o número WABA
3. Verifique no MinIO se o arquivo agora tem extensão (ex: `1234567890.pdf`)
4. Copie a URL pública do arquivo e abra no navegador — deve exibir em vez de baixar
5. Verifique no Baserow (tabela 227) se o registro foi criado com o arquivo correto

---

## Referência: MIME types comuns do WhatsApp

| MIME Type | Extensão gerada |
|-----------|----------------|
| `application/pdf` | `.pdf` |
| `image/jpeg` | `.jpeg` |
| `image/png` | `.png` |
| `audio/ogg` | `.ogg` |
| `audio/mpeg` | `.mpeg` |
| `video/mp4` | `.mp4` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.document` * |

\* Para MIME types longos (Word, Excel), a expressão `.split("/").pop()` gera extensões não ideais. Se precisar de `.docx`/`.xlsx`, será necessário um nó Code com mapeamento manual. Para a maioria dos casos (PDF, imagens, áudio, vídeo), funciona perfeitamente.

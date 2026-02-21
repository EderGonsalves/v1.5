# Agenda – exemplos de chamadas cURL

Todos os endpoints vivem sob `https://<host>/api/v1/calendar`. Para os exemplos abaixo, considere `BASE_URL="http://localhost:3000"` e substitua `INSTITUTION_ID`, `EVENT_ID` e `GUEST_ID` pelos valores reais do seu ambiente.

> **Importante:** o `institutionId` precisa estar presente em **pelo menos um** dos locais aceitos pela API (query string `?institutionId=`, header `x-institution-id` ou corpo em `auth.institutionId`). Para simplificar, os exemplos abaixo utilizam o header `x-institution-id`.

## Listar eventos

```bash
curl --request GET \
  --url "$BASE_URL/api/v1/calendar/events?start=2026-02-01&end=2026-02-29" \
  --header "x-institution-id: INSTITUTION_ID" \
  --header "Accept: application/json"
```

## Buscar um evento específico

```bash
curl --request GET \
  --url "$BASE_URL/api/v1/calendar/events/EVENT_ID" \
  --header "x-institution-id: INSTITUTION_ID" \
  --header "Accept: application/json"
```

## Criar evento

```bash
curl --request POST \
  --url "$BASE_URL/api/v1/calendar/events" \
  --header "x-institution-id: INSTITUTION_ID" \
  --header "Content-Type: application/json" \
  --data '{
    "title": "Reunião com cliente",
    "description": "Briefing inicial sobre o caso",
    "start_datetime": "2026-02-10T13:00:00Z",
    "end_datetime": "2026-02-10T14:00:00Z",
    "timezone": "America/Sao_Paulo",
    "location": "Sala 3",
    "meeting_link": "https://meet.example.com/briefing",
    "reminder_minutes_before": 30,
    "notify_by_email": true,
    "notify_by_phone": false,
    "user_id": 42,
    "guests": [
      { "name": "Ana Lima", "email": "ana@example.com", "phone": "+5511999998888" },
      { "name": "Bruno Costa" }
    ]
  }'
```

## Atualizar evento

```bash
curl --request PUT \
  --url "$BASE_URL/api/v1/calendar/events/EVENT_ID" \
  --header "x-institution-id: INSTITUTION_ID" \
  --header "Content-Type: application/json" \
  --data '{
    "title": "Reunião com cliente (remota)",
    "meeting_link": "https://meet.example.com/briefing-atualizado",
    "notify_by_phone": true
  }'
```

## Excluir evento

```bash
curl --request DELETE \
  --url "$BASE_URL/api/v1/calendar/events/EVENT_ID" \
  --header "x-institution-id: INSTITUTION_ID"
```

## Adicionar convidado em um evento existente

```bash
curl --request POST \
  --url "$BASE_URL/api/v1/calendar/events/EVENT_ID/guests" \
  --header "x-institution-id: INSTITUTION_ID" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Carla Menezes",
    "email": "carla@example.com",
    "phone": "+5511987654321"
  }'
```

## Remover convidado de um evento

```bash
curl --request DELETE \
  --url "$BASE_URL/api/v1/calendar/events/EVENT_ID/guests/GUEST_ID" \
  --header "x-institution-id: INSTITUTION_ID"
```

### Dicas rápidas
- Datas devem estar em UTC (`YYYY-MM-DDTHH:mm:ssZ`) e o `end_datetime` precisa ser maior ou igual ao `start_datetime`.
- `timezone` aceita o identificador IANA (ex.: `America/Sao_Paulo`) usado pelo front-end.
- `notify_by_email` e `notify_by_phone` são booleanos; quando presentes, a API converte internamente para flags de texto.
- Os endpoints de convidados validam se o evento pertence à mesma instituição; você sempre receberá 403 se tentar cruzar eventos de outra conta.

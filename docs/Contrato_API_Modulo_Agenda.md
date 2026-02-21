# Contrato de API -- Módulo de Agenda

Base URL: /api/v1/calendar

Autenticação: Authorization: Bearer {token} opcional

------------------------------------------------------------------------

## 1. Criar Evento

POST /events

Body: { "title": "Reunião Estratégica", "description": "Alinhamento
trimestral", "start_datetime": "2026-02-10T13:00:00Z", "end_datetime":
"2026-02-10T14:00:00Z", "timezone": "America/Sao_Paulo", "location":
"Sala 3", "meeting_link": "https://meet.exemplo.com/123",
"reminder_minutes_before": 30, "notify_by_email": true,
"notify_by_phone": false, "guests": \[ { "name": "João", "email":
"joao@email.com", "phone": "+5511999999999" } \] }

Response 201: { "id": 123, "status": "created" }

------------------------------------------------------------------------

## 2. Listar Eventos

GET /events?start=2026-02-01&end=2026-02-28

Response 200: \[ { "id": 123, "title": "Reunião Estratégica",
"start_datetime": "2026-02-10T13:00:00Z", "end_datetime":
"2026-02-10T14:00:00Z" }\]

------------------------------------------------------------------------

## 3. Atualizar Evento

PUT /events/{id}

Body: mesmos campos do POST

Response 200: { "status": "updated" }

------------------------------------------------------------------------

## 4. Excluir Evento

DELETE /events/{id}

Response 200: { "status": "deleted" }

------------------------------------------------------------------------

## 5. Gerenciar Convidados

POST /events/{id}/guests DELETE /events/{id}/guests/{guest_id}

------------------------------------------------------------------------

## 6. Observações

-   Todos os horários devem ser enviados em UTC.
-   Timezone original deve ser informado separadamente.
-   Integração com Google será adicionada futuramente.

# PRD -- Módulo de Agenda

## 1. Visão Geral

O módulo de Agenda será uma funcionalidade integrada ao sistema
existente (React + Next.js + Baserow), permitindo que usuários:

-   Criem e gerenciem eventos
-   Configurem alertas personalizados
-   Adicionem convidados aos eventos
-   Disponibilizem acesso via API para consumo por agentes de IA

⚠️ **Importante:**\
A integração com Google Calendar será implementada em uma fase futura. O
sistema será desenvolvido preparado para essa integração, mas ela não
fará parte do MVP.

------------------------------------------------------------------------

## 2. Objetivos

### Objetivo Principal

Criar um módulo de agenda com:

-   CRUD completo de eventos
-   Sistema de alertas configurável
-   Gestão de convidados
-   API segura para consumo interno e por agente de IA
-   Estrutura preparada para futura integração com Google Calendar

------------------------------------------------------------------------

## 3. Modelo de Dados

### Tabela: events

-   id
-   InstitutionID
-   user_id
-   title
-   description
-   start_datetime (datetime UTC)
-   end_datetime (datetime UTC)
-   timezone (text -- ex: America/Sao_Paulo)
-   location
-   meeting_link
-   reminder_minutes_before (number)
-   notify_by_email (text)
-   notify_by_phone (boolean)
-   google_event_id (nullable -- futuro)
-   sync_status (pending \| synced \| error -- futuro)
-   created_at
-   updated_at
-   deleted_at (soft delete)

### Tabela: event_guests

-   id
-   event_id (relation)
-   name
-   email
-   phone
-   notification_status (pending \| sent \| failed)
-   created_at
-   updated_at

------------------------------------------------------------------------

## 4. Sistema de Alertas

-   Usuário define quanto tempo antes será lembrado.
-   Cálculo baseado em start_datetime.
-   Processamento via worker/cron. conforme integração atual
-   Envio por:
    -   E-mail
    -   WhatsApp (phone)

------------------------------------------------------------------------

## 5. Integração Google (Futuro)

Será implementado posteriormente com:

-   OAuth 2.0
-   Sincronização inicial unidirecional
-   Controle de sync_status
-   Tokens criptografados

O sistema interno continuará sendo a fonte primária dos dados.

------------------------------------------------------------------------

## 6. Requisitos Técnicos

-   Armazenamento sempre em UTC
-   Conversão de timezone no frontend
-   Multi-tenant obrigatório
-   Rate limiting nas APIs
-   HTTPS obrigatório

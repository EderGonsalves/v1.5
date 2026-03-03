-- Migração: Agenda a Nível de Usuário
-- Executar manualmente no PostgreSQL antes de usar a feature

-- 1. Flag agenda_enabled na tabela de usuários (236)
ALTER TABLE database_table_236
  ADD COLUMN IF NOT EXISTS field_2007 boolean DEFAULT false;

-- 2. Campo user_id na tabela de calendar_settings (246)
ALTER TABLE database_table_246
  ADD COLUMN IF NOT EXISTS field_2008 numeric;

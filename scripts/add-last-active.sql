-- Adiciona coluna last_active_at para heartbeat de usuários ativos.
-- Rodar diretamente no PostgreSQL (Baserow ignora colunas desconhecidas).
ALTER TABLE database_table_236 ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_active
  ON database_table_236 (last_active_at)
  WHERE last_active_at IS NOT NULL;

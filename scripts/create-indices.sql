-- =============================================================================
-- PostgreSQL Indices for Drizzle ORM Direct Access
-- =============================================================================
-- As tabelas Baserow (database_table_*) só têm PK (id). Sem índices nas
-- colunas filtradas, queries com WHERE são full-table scans.
--
-- Executar via: psql -h postgres -U postgres -d baserow -f create-indices.sql
-- Ou dentro do container: docker exec -i <pg_container> psql -U postgres -d baserow < create-indices.sql
-- =============================================================================

-- ===================== TABLE 225: cases =====================
-- Tabela principal do sistema — mais acessada

-- institutionID: filtro em quase toda query de cases
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_225_institution_id
  ON database_table_225 (field_1692);

-- CustumerPhone: LIKE '%digits%' para duplicate detection e auto-merge
-- B-tree index helps with prefix matches; pg_trgm for contains
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_225_custumer_phone
  ON database_table_225 (field_1684)
  WHERE field_1684 IS NOT NULL AND field_1684 != '';

-- assigned_to_user_id + institutionID: countUserCases (round-robin assignment)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_225_assigned_user_institution
  ON database_table_225 (field_1903, field_1692);

-- department_id: filtro de casos por departamento
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_225_department_id
  ON database_table_225 (field_1901)
  WHERE field_1901 IS NOT NULL;

-- ===================== TABLE 227: caseMessages =====================
-- Maior volume de dados — mensagens de chat

-- from: LIKE '%phone%' para busca por telefone do cliente
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_from
  ON database_table_227 (field_1706)
  WHERE field_1706 IS NOT NULL AND field_1706 != '';

-- to: LIKE '%phone%' para busca por telefone do destinatário
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_to
  ON database_table_227 (field_1707)
  WHERE field_1707 IS NOT NULL AND field_1707 != '';

-- CaseId: inArray() fallback + merge operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_case_id
  ON database_table_227 (field_1701)
  WHERE field_1701 IS NOT NULL;

-- CaseId + id: incremental polling (WHERE caseId = X AND id > sinceId)
-- Composite index allows index-only scan for the most frequent query pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_case_id_incremental
  ON database_table_227 (field_1701, id DESC)
  WHERE field_1701 IS NOT NULL;

-- ===================== TABLE 236: users =====================
-- Autenticação e RBAC — consultas frequentes

-- institutionId: filtro principal de users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_236_institution_id
  ON database_table_236 (field_1798);

-- legacy_user_id + institutionId: findExistingUser, findUserByLegacy
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_236_legacy_user_institution
  ON database_table_236 (field_1797, field_1798)
  WHERE field_1797 IS NOT NULL;

-- email: findExistingUser, authenticateViaUsersTable
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_236_email
  ON database_table_236 (field_1800)
  WHERE field_1800 IS NOT NULL;

-- ===================== TABLE 237: roles =====================

-- institutionId: filtro de roles por instituição
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_237_institution_id
  ON database_table_237 (field_1804);

-- ===================== TABLE 238: menu =====================

-- institutionId: filtro de menus por instituição
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_238_institution_id
  ON database_table_238 (field_1811);

-- ===================== TABLE 239: permissions =====================

-- institutionId: filtro de permissions por instituição
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_239_institution_id
  ON database_table_239 (field_1818);

-- ===================== TABLE 243: supportTickets =====================

-- institutionId: filtro na listagem de tickets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_243_institution_id
  ON database_table_243 (field_1844);

-- ===================== TABLE 244: supportMessages =====================

-- ticketId: filtro de mensagens por ticket
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_244_ticket_id
  ON database_table_244 (field_1856);

-- ===================== TABLE 247: departments =====================

-- institutionId + isActive: composite para listagem filtrada
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_247_institution_active
  ON database_table_247 (field_1891, field_1894);

-- name: check de duplicatas no create/update
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_247_name
  ON database_table_247 (field_1892);

-- ===================== TABLE 248: userDepartments =====================

-- userId + institutionId: getUserDepartmentIds
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_248_user_institution
  ON database_table_248 (field_1898, field_1897);

-- departmentId + institutionId: fetchDepartmentUserIds
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_248_dept_institution
  ON database_table_248 (field_1899, field_1897);

-- ===================== TABLE 250: userFeatures =====================

-- userId + institutionId: fetchUserFeatures (per-user feature toggles)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_250_user_institution
  ON database_table_250 (field_1915, field_1916);

-- ===================== TABLE 251: assignmentQueue =====================

-- institutionId: fetchQueueRecords (round-robin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_251_institution_id
  ON database_table_251 (field_1920);

-- ===================== TABLE 252: lawsuitTracking =====================

-- caseId + institutionId: getTrackingByCaseId
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_252_case_institution
  ON database_table_252 (field_1932, field_1933);

-- ===================== TABLE 253: lawsuitMovements =====================

-- trackingId + id DESC: getMovementsByTrackingId paginado
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_253_tracking_id_desc
  ON database_table_253 (field_1943, id DESC);

-- caseId: getMovementsByCaseId
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_253_case_id
  ON database_table_253 (field_1944);

-- ===================== TABLE 254: pushSubscriptions =====================

-- endpoint: saveSubscription lookup (unique-ish)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_254_endpoint
  ON database_table_254 (field_1954);

-- institutionId: getSubscriptionsByInstitution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_254_institution_id
  ON database_table_254 (field_1960);

-- legacyUserId: cleanup de subscriptions antigas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_254_legacy_user_id
  ON database_table_254 (field_1959)
  WHERE field_1959 IS NOT NULL AND field_1959 != '';

-- userEmail: cleanup alternativo
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_254_user_email
  ON database_table_254 (field_1957)
  WHERE field_1957 IS NOT NULL AND field_1957 != '';

-- ===================== TABLE 256: signEnvelopes =====================

-- caseId + institutionId: getEnvelopesByCaseId
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_256_case_institution
  ON database_table_256 (field_1976, field_1986);

-- envelopeId: getEnvelopeByRiaId (webhook lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_256_envelope_id
  ON database_table_256 (field_1977);

-- ===================== TABLE 257: documentTemplates =====================

-- institutionId + isActive: listTemplates filtrada
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_257_institution_active
  ON database_table_257 (field_1993, field_1997);

-- ===================== TABLE 224: config =====================

-- bodyAuthInstitutionId: listInstitutions (busca por instituição)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_224_institution_id
  ON database_table_224 (field_1672);

-- =============================================================================
-- Trigram index for phone LIKE '%pattern%' searches (requires pg_trgm extension)
-- =============================================================================
-- Otimiza LIKE '%phone%' (contains) — sem estes índices é full table scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_225_phone_trgm
  ON database_table_225 USING GIN (field_1684 gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_from_trgm
  ON database_table_227 USING GIN (field_1706 gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_227_to_trgm
  ON database_table_227 USING GIN (field_1707 gin_trgm_ops);

-- =============================================================================

-- Verificar índices criados
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE tablename LIKE 'database_table_%'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

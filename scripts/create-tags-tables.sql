-- ============================================================================
-- Tags Classification System — Indexes
-- Tables already created by Baserow. Run this for performance indexes only.
-- ============================================================================

-- Table 258: institution_tags
-- field_2010 = institution_id, field_2011 = category, field_2015 = is_active
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_258_institution_id
  ON database_table_258 (field_2010);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_258_institution_category
  ON database_table_258 (field_2010, field_2011);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_258_institution_active
  ON database_table_258 (field_2010, field_2015);

-- Table 259: case_tags
-- field_2021 = case_id, field_2022 = tag_id, field_2023 = institution_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_259_case_id
  ON database_table_259 (field_2021);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_259_tag_id
  ON database_table_259 (field_2022);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_259_institution_id
  ON database_table_259 (field_2023);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_259_case_institution
  ON database_table_259 (field_2021, field_2023);

-- ============================================================================
-- USDA FDC Ingestion: Database Indexes
-- 
-- Adds indexes needed for efficient USDA data ingestion and lookup.
-- Safe to run multiple times (all CREATE INDEX use IF NOT EXISTS).
-- ============================================================================

-- Unique index on source_provider + source_id for USDA records
-- This prevents duplicate USDA foods and enables efficient upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_objects_usda_source 
  ON public.food_objects (source_provider, source_id) 
  WHERE source_provider = 'usda' AND is_deleted = false;

-- Index on canonical_name for text search (if not exists)
-- Note: We already have a GIN index for full-text search, this is for LIKE queries
CREATE INDEX IF NOT EXISTS idx_food_objects_canonical_name_lower 
  ON public.food_objects (LOWER(canonical_name));

-- Index on UPC for barcode lookups (already exists but ensure it's there)
CREATE INDEX IF NOT EXISTS idx_food_objects_upc 
  ON public.food_objects (upc) 
  WHERE upc IS NOT NULL;

-- Index on source_provider for filtering by data source
CREATE INDEX IF NOT EXISTS idx_food_objects_source_provider 
  ON public.food_objects (source_provider) 
  WHERE source_provider IS NOT NULL;

-- Composite index for search ranking (source_type + is_verified)
-- Helps prioritize branded > common in search results
CREATE INDEX IF NOT EXISTS idx_food_objects_search_rank 
  ON public.food_objects (source_type, is_verified, is_deleted);

-- Optional: Trigram index for fuzzy search on canonical_name
-- Requires pg_trgm extension to be enabled
-- Uncomment if pg_trgm is available and fuzzy search is needed
-- CREATE INDEX IF NOT EXISTS idx_food_objects_canonical_name_trgm 
--   ON public.food_objects USING gin (canonical_name gin_trgm_ops);

-- ============================================================================
-- Verification queries (run after indexes are created)
-- ============================================================================

-- Check index existence
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'food_objects' 
-- ORDER BY indexname;

-- ============================================================================
-- Notes
-- ============================================================================
-- 
-- The unique index on (source_provider, source_id) WHERE source_provider='usda'
-- allows efficient upserts using ON CONFLICT:
--
--   INSERT INTO food_objects (...) 
--   VALUES (...) 
--   ON CONFLICT (source_provider, source_id) WHERE source_provider = 'usda' AND is_deleted = false
--   DO UPDATE SET ...;
--
-- This ensures each USDA fdc_id maps to exactly one food_objects row.
-- ============================================================================

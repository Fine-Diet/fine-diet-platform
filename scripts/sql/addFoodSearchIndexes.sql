-- ============================================================================
-- Food Search Indexes: Optimize admin food search queries
-- 
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- This migration adds indexes to speed up food search in the admin panel.
-- The pg_trgm extension enables fast LIKE/ILIKE searches with wildcards.
--
-- NOTE: These indexes are created WITHOUT CONCURRENTLY so they can run in
-- the Supabase SQL Editor. This will briefly lock the table during creation.
-- For very large tables in production, run these during low-traffic periods.
-- ============================================================================

-- Enable trigram extension for fast LIKE searches (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Part 1: Trigram indexes for ILIKE search performance
-- ============================================================================

-- Trigram index on canonical_name for fast %pattern% searches
CREATE INDEX IF NOT EXISTS idx_food_objects_canonical_name_trgm 
  ON public.food_objects 
  USING gin (canonical_name gin_trgm_ops);

-- Trigram index on brand_name for fast %pattern% searches
CREATE INDEX IF NOT EXISTS idx_food_objects_brand_name_trgm 
  ON public.food_objects 
  USING gin (brand_name gin_trgm_ops)
  WHERE brand_name IS NOT NULL;

-- ============================================================================
-- Part 2: B-tree indexes for common filter combinations
-- ============================================================================

-- Composite index for admin list queries (filtered by is_deleted, ordered by updated_at)
-- This covers the base query pattern without search
CREATE INDEX IF NOT EXISTS idx_food_objects_admin_base_query
  ON public.food_objects (is_deleted, updated_at DESC);

-- Composite index for provider-filtered queries
CREATE INDEX IF NOT EXISTS idx_food_objects_provider_updated
  ON public.food_objects (source_provider, is_deleted, updated_at DESC)
  WHERE is_deleted = false;

-- ============================================================================
-- Part 3: Verify indexes
-- ============================================================================

-- Check that indexes were created:
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'food_objects' 
--   AND indexname LIKE '%trgm%' OR indexname LIKE '%admin%';

-- Test query performance (should use the trigram index):
-- EXPLAIN ANALYZE 
-- SELECT * FROM food_objects 
-- WHERE is_deleted = false 
--   AND canonical_name ILIKE '%chicken%' 
-- ORDER BY updated_at DESC 
-- LIMIT 50;

-- ============================================================================
-- Notes:
-- ============================================================================
-- 
-- 1. gin_trgm_ops enables fast pattern matching with wildcards
-- 2. The estimated count in the API is faster than exact count
-- 3. For very large tables (100k+), consider full-text search instead
-- 4. If pg_trgm is not available, the API falls back to basic ILIKE
--
-- To create indexes without locking (for large production tables), use psql:
--   CREATE INDEX CONCURRENTLY idx_name ON table USING gin (col gin_trgm_ops);

-- ============================================================================
-- USDA FDC Ingestion: Database Indexes & Constraints
-- 
-- IMPORTANT: Run this BEFORE any ingestion!
-- Safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- UNIQUE CONSTRAINT for upserts (REQUIRED for ingestion)
-- ============================================================================
-- 
-- Supabase/PostgreSQL ON CONFLICT requires a unique CONSTRAINT, not just an index.
-- This constraint enables the ingestion script's upsert logic.
--
-- If you see: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- It means this constraint doesn't exist yet. Run this script!
--

-- First, drop any existing partial unique index that won't work with ON CONFLICT
DROP INDEX IF EXISTS idx_food_objects_usda_source;

-- Create the unique constraint on (source_provider, source_id)
-- This allows upserts keyed by provider + external ID
-- Note: We use a constraint, not a partial index, because ON CONFLICT needs it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_food_objects_source_provider_source_id'
  ) THEN
    ALTER TABLE public.food_objects 
    ADD CONSTRAINT uq_food_objects_source_provider_source_id 
    UNIQUE (source_provider, source_id);
  END IF;
END $$;

-- ============================================================================
-- Performance indexes
-- ============================================================================

-- Index on canonical_name for text search (LIKE queries)
CREATE INDEX IF NOT EXISTS idx_food_objects_canonical_name_lower 
  ON public.food_objects (LOWER(canonical_name));

-- Index on UPC for barcode lookups
CREATE INDEX IF NOT EXISTS idx_food_objects_upc 
  ON public.food_objects (upc) 
  WHERE upc IS NOT NULL;

-- Index on source_provider for filtering by data source
CREATE INDEX IF NOT EXISTS idx_food_objects_source_provider 
  ON public.food_objects (source_provider) 
  WHERE source_provider IS NOT NULL;

-- Composite index for search ranking (source_type + is_verified)
CREATE INDEX IF NOT EXISTS idx_food_objects_search_rank 
  ON public.food_objects (source_type, is_verified, is_deleted);

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Verify the constraint exists:
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'food_objects'::regclass;

-- Check all indexes:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'food_objects';

-- ============================================================================
-- Troubleshooting
-- ============================================================================
--
-- ERROR: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--   -> Run this script in Supabase SQL Editor before ingestion
--
-- ERROR: "duplicate key value violates unique constraint"
--   -> You have existing USDA data. Use --since to resume, or delete existing:
--      DELETE FROM food_objects WHERE source_provider = 'usda';
--
-- ============================================================================

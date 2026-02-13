-- ============================================================================
-- Migration: Add food_objects.measures JSONB column
-- ============================================================================
-- Stores USDA household portion measures for unit switching.
-- Shape: [{ "unit": "cup", "grams": 240, "label": "1 cup" }, ...]
--   - unit:  canonical lowercase unit string (e.g. "cup", "tablespoon", "oz")
--   - grams: grams per 1 unit (number, > 0)
--   - label: optional human-readable label (e.g. "1 cup, chopped")
--
-- Run this BEFORE re-ingesting USDA data with the updated ingestFdc.ts.
-- ============================================================================

ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS measures JSONB;

COMMENT ON COLUMN public.food_objects.measures IS
  'Array of household portion measures: [{ unit: string, grams: number, label?: string }]. Parsed from USDA food_portion + measure_unit CSVs. NULL when no portion data is available.';

-- Optional: GIN index for future queries on measures (e.g. finding all foods with a "cup" measure)
-- CREATE INDEX IF NOT EXISTS idx_food_objects_measures ON public.food_objects USING GIN (measures);

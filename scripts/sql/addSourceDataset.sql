-- ============================================================================
-- Migration: Add source_dataset column to food_objects
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- Add nullable column to track which USDA dataset the row came from
-- Values: 'branded' | 'foundation' | 'sr_legacy' | 'survey' | null (for non-USDA)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS source_dataset TEXT;

-- Optional: Add check constraint (uncomment if you want strict validation)
-- ALTER TABLE public.food_objects
-- ADD CONSTRAINT chk_source_dataset 
-- CHECK (source_dataset IS NULL OR source_dataset IN ('branded', 'foundation', 'sr_legacy', 'survey', 'fndds'));

-- Index for efficient querying by dataset
CREATE INDEX IF NOT EXISTS idx_food_objects_source_dataset
ON public.food_objects (source_dataset)
WHERE source_dataset IS NOT NULL;

-- ============================================================================
-- Verification query (run after migration)
-- ============================================================================
-- SELECT 
--   source_dataset,
--   count(*) 
-- FROM public.food_objects 
-- WHERE is_deleted = false 
-- GROUP BY source_dataset 
-- ORDER BY count(*) DESC;

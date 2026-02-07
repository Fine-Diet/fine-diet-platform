-- ============================================================================
-- USDA Ingestion Health Checks
-- Run in Supabase Dashboard → SQL Editor to verify ingestion correctness
--
-- All queries use guarded bigint casts to handle potential non-numeric source_ids
-- Replace {{CHECKPOINT}} placeholder with actual checkpoint value when needed
-- ============================================================================

-- ============================================================================
-- 1) NON-NUMERIC SOURCE_ID COUNT
-- Should be 0 for active rows (bad rows should be quarantined with is_deleted=true)
-- ============================================================================
SELECT 
  'Non-numeric source_ids' as check_name,
  count(*) as count,
  CASE WHEN count(*) = 0 THEN '✓ OK' ELSE '⚠ NEEDS ATTENTION' END as status
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_id !~ '^[0-9]+$';

-- ============================================================================
-- 2) COUNT BREAKDOWN: PROVIDER / TYPE / DATASET
-- Main overview of all food_objects by classification
-- ============================================================================
SELECT 
  source_provider,
  source_type,
  source_dataset,
  count(*) as cnt
FROM public.food_objects
WHERE is_deleted = false
GROUP BY source_provider, source_type, source_dataset
ORDER BY 
  source_provider NULLS LAST,
  cnt DESC;

-- ============================================================================
-- 3) UNTAGGED USDA ROWS
-- Should trend to 0 after backfill + new ingests with source_dataset
-- ============================================================================
SELECT 
  'Untagged USDA rows' as check_name,
  count(*) as count,
  CASE 
    WHEN count(*) = 0 THEN '✓ OK'
    WHEN count(*) < 100 THEN '⚠ Minor - run backfill'
    ELSE '⚠ NEEDS BACKFILL'
  END as status
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL;

-- ============================================================================
-- 4) FOUNDATION STILL BRANDED
-- Should be 0 - foundation rows should have source_type='common'
-- ============================================================================
SELECT 
  'Foundation still branded' as check_name,
  count(*) as count,
  CASE WHEN count(*) = 0 THEN '✓ OK' ELSE '⚠ NEEDS FIX' END as status
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'foundation'
  AND source_type != 'common';

-- ============================================================================
-- 5) DATASET/TYPE MISMATCHES ("Weird Combos")
-- Check for rows where source_dataset doesn't match expected source_type
-- Expected mappings:
--   branded    -> source_type = 'branded'
--   foundation -> source_type = 'common'
--   sr_legacy  -> source_type = 'common'
--   survey     -> source_type = 'common'
--   fndds      -> source_type = 'common'
-- ============================================================================
SELECT 
  'Dataset/type mismatches' as check_name,
  source_dataset,
  source_type,
  count(*) as count,
  CASE 
    WHEN source_dataset = 'branded' AND source_type != 'branded' THEN '⚠ branded should be branded'
    WHEN source_dataset = 'foundation' AND source_type != 'common' THEN '⚠ foundation should be common'
    WHEN source_dataset = 'sr_legacy' AND source_type != 'common' THEN '⚠ sr_legacy should be common'
    WHEN source_dataset = 'survey' AND source_type != 'common' THEN '⚠ survey should be common'
    WHEN source_dataset = 'fndds' AND source_type != 'common' THEN '⚠ fndds should be common'
    ELSE '✓ OK'
  END as status
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NOT NULL
  AND (
    (source_dataset = 'branded' AND source_type != 'branded')
    OR (source_dataset = 'foundation' AND source_type != 'common')
    OR (source_dataset = 'sr_legacy' AND source_type != 'common')
    OR (source_dataset = 'survey' AND source_type != 'common')
    OR (source_dataset = 'fndds' AND source_type != 'common')
  )
GROUP BY source_dataset, source_type
ORDER BY count DESC;

-- If no mismatches, show a success row:
SELECT 
  'Dataset/type mismatches' as check_name,
  'All correct' as source_dataset,
  NULL as source_type,
  0 as count,
  '✓ OK' as status
WHERE NOT EXISTS (
  SELECT 1 FROM public.food_objects
  WHERE is_deleted = false
    AND source_provider = 'usda'
    AND source_dataset IS NOT NULL
    AND (
      (source_dataset = 'branded' AND source_type != 'branded')
      OR (source_dataset = 'foundation' AND source_type != 'common')
      OR (source_dataset = 'sr_legacy' AND source_type != 'common')
      OR (source_dataset = 'survey' AND source_type != 'common')
      OR (source_dataset = 'fndds' AND source_type != 'common')
    )
);

-- ============================================================================
-- 6) BRANDED PROGRESS SIGNALS
-- Track ingestion progress relative to checkpoint
--
-- Replace {{CHECKPOINT}} with your current checkpoint value (e.g., 2500000)
-- Replace {{WINDOW_START}} with checkpoint - window size (e.g., 2490000)
-- Replace {{WINDOW_END}} with checkpoint value (e.g., 2500000)
-- ============================================================================

-- 6a) Count of branded rows AT OR ABOVE checkpoint
-- Shows how many rows exist beyond where ingestion has processed
/*
SELECT 
  'Branded at/above checkpoint' as check_name,
  count(*) as count,
  '{{CHECKPOINT}}' as checkpoint_value
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'branded'
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint >= {{CHECKPOINT}};
*/

-- 6b) Count of branded rows in a window BELOW checkpoint
-- Shows recent insertions (checkpoint - window_size to checkpoint)
/*
SELECT 
  'Branded in recent window' as check_name,
  count(*) as count,
  '{{WINDOW_START}} - {{WINDOW_END}}' as window_range
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'branded'
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint BETWEEN {{WINDOW_START}} AND {{WINDOW_END}};
*/

-- ============================================================================
-- 7) FDC_ID RANGES PER DATASET
-- Sanity check - verify ranges match expected values
-- ============================================================================
SELECT 
  source_dataset,
  count(*) as total_rows,
  min(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as min_fdc_id,
  max(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as max_fdc_id
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
GROUP BY source_dataset
ORDER BY min_fdc_id NULLS LAST;

-- ============================================================================
-- 8) QUICK SUMMARY DASHBOARD
-- Single query that returns key health metrics
-- ============================================================================
SELECT 
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda') as total_usda,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'branded') as branded_count,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'foundation') as foundation_count,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'sr_legacy') as sr_legacy_count,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'survey') as survey_count,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'fndds') as fndds_count,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset IS NULL) as untagged_usda,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_id !~ '^[0-9]+$' AND source_id !~ '^fndds_[0-9]+$') as non_numeric_ids,
  (SELECT count(*) FROM public.food_objects WHERE is_deleted = false AND source_provider = 'usda' AND source_dataset = 'foundation' AND source_type != 'common') as foundation_still_branded;

-- ============================================================================
-- EXPECTED "HEALTHY" VALUES:
--
-- non_numeric_ids         = 0
-- foundation_still_branded = 0
-- untagged_usda           = 0 (after backfill + new ingests with source_dataset)
--
-- Dataset/type mappings:
--   branded    -> ~340,000+  (growing as ingestion progresses)
--   foundation -> ~78,000
--   sr_legacy  -> ~7,800
--   survey     -> ~5,500
--   fndds      -> varies (source_id = fndds_<fdc_id>; same CSV as survey optional)
-- ============================================================================

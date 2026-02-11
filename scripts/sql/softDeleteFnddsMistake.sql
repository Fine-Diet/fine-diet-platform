-- ============================================================================
-- Optional: Soft-delete FNDDS rows that were mistakenly ingested from Survey
--
-- Use when Survey was ingested as FNDDS (source_id like fndds_2705383 etc.;
-- range 2,705,383–2,710,814 matches Survey). This only soft-deletes
-- (is_deleted = true); it does not drop rows.
--
-- Run in Supabase Dashboard → SQL Editor. Review counts before running UPDATE.
-- ============================================================================

-- 1) Preview: how many rows would be affected
SELECT
  count(*) AS rows_to_soft_delete,
  min(CASE WHEN source_id ~ '^fndds_([0-9]+)$' THEN (regexp_match(source_id, '^fndds_([0-9]+)$'))[1]::bigint END) AS min_fdc,
  max(CASE WHEN source_id ~ '^fndds_([0-9]+)$' THEN (regexp_match(source_id, '^fndds_([0-9]+)$'))[1]::bigint END) AS max_fdc
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'fndds';

-- 2) Soft-delete all mistakenly ingested FNDDS rows (Survey was ingested as FNDDS)
--    Run this AFTER reviewing step 1. This sets is_deleted = true for all current fndds rows.
/*
UPDATE public.food_objects
SET is_deleted = true
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'fndds';
*/

-- 2b) Alternative: soft-delete ONLY rows in Survey fdc_id range (2,705,383 – 2,710,814)
--     Use if you later ingest real FNDDS and want to remove only the mistaken batch.
/*
UPDATE public.food_objects
SET is_deleted = true
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'fndds'
  AND source_id ~ '^fndds_([0-9]+)$'
  AND (regexp_match(source_id, '^fndds_([0-9]+)$'))[1]::bigint BETWEEN 2705383 AND 2710814;
*/

-- 3) Verify after UPDATE: fndds count should be 0 (or reduced)
-- SELECT count(*) AS fndds_remaining
-- FROM public.food_objects
-- WHERE is_deleted = false
--   AND source_provider = 'usda'
--   AND source_dataset = 'fndds';

-- ============================================================================
-- Backfill: Tag existing USDA rows with source_dataset and fix Foundation source_type
-- Run this in Supabase Dashboard → SQL Editor AFTER running addSourceDataset.sql
--
-- IMPORTANT: This script uses FDC_ID ranges to avoid misclassification.
-- DO NOT rely on UPC IS NULL as a primary classifier - branded items can have NULL UPCs!
-- ============================================================================

-- ============================================================================
-- STEP 0a: Quarantine known bad rows with non-numeric source_id
-- Found 1 row with source_id = ",11,2019-04-01" which breaks bigint casts
-- ============================================================================
UPDATE public.food_objects 
SET is_deleted = true 
WHERE id = '39eee46d-de92-498d-8089-4e7792f75c84';

-- Check for any other non-numeric USDA source_ids:
-- SELECT id, source_id, canonical_name, source_type
-- FROM public.food_objects
-- WHERE source_provider = 'usda'
--   AND source_id !~ '^[0-9]+$'
--   AND is_deleted = false;

-- ============================================================================
-- STEP 0b: Get FDC_ID ranges for each dataset (with guarded casts)
-- Run this first to understand your data:
-- ============================================================================
/*
SELECT 
  'Current breakdown' as info,
  source_provider,
  source_type,
  count(*) as cnt,
  count(*) filter (where source_id ~ '^[0-9]+$') as numeric_ids,
  count(*) filter (where source_id !~ '^[0-9]+$') as non_numeric_ids,
  min(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as min_fdc_id,
  max(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as max_fdc_id
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
GROUP BY source_provider, source_type
ORDER BY cnt DESC;
*/

-- ============================================================================
-- USDA FDC_ID Ranges (from CSV inspection, Dec 2025)
--
-- Dataset       | Min FDC_ID   | Max FDC_ID     | Expected source_type
-- --------------|--------------|----------------|---------------------
-- sr_legacy     | 167,512      | 175,259        | common
-- survey        | 323,505      | 2,345,063      | common
-- foundation    | 321,358      | 2,751,503      | common
-- branded       | 355,098      | 2,701,553      | branded
--
-- SAFE NON-OVERLAPPING SEGMENTS:
-- 1) SR Legacy:        160,000 - 180,000   (distinct, no overlap)
-- 2) Foundation tail:  2,701,554 - 2,760,000 (above branded max, foundation only)
--
-- OVERLAPPING MIDDLE REGION (320k - 2.7M):
-- - Foundation, Survey, and Branded all exist here
-- - Must rely on original source_type for classification (trust ingestion)
-- - UPC presence is a SECONDARY signal, not primary (branded can have NULL UPC)
-- ============================================================================

-- ============================================================================
-- STEP 1: Tag SR Legacy rows (distinct, non-overlapping range)
-- FDC_ID range: ~167,000 to ~175,500 — completely distinct from other datasets
-- ============================================================================
UPDATE public.food_objects
SET source_dataset = 'sr_legacy'
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint BETWEEN 160000 AND 180000;

-- ============================================================================
-- STEP 2: Tag Foundation TAIL rows (safe, non-overlapping range)
-- Only the tail of foundation (fdc_id > branded max) can be safely identified
-- These rows are ABOVE the branded max (2,701,553), so they're definitely foundation
-- Also FIX source_type to 'common' if it was misclassified as 'branded'
-- ============================================================================
UPDATE public.food_objects
SET 
  source_dataset = 'foundation',
  source_type = 'common'  -- Foundation should be common, not branded!
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint > 2701553;  -- Above branded max = definitely foundation

-- ============================================================================
-- STEP 3: Tag Branded rows (by original source_type + UPC as secondary)
-- Trust the original source_type='branded' classification for the overlapping region
-- UPC presence is used as secondary confirmation, not primary classifier
-- ============================================================================
UPDATE public.food_objects
SET source_dataset = 'branded'
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND source_type = 'branded';  -- Trust original classification

-- Also tag any remaining rows with UPC as branded (UPC strongly indicates branded)
UPDATE public.food_objects
SET source_dataset = 'branded'
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND upc IS NOT NULL;

-- ============================================================================
-- STEP 4: Tag Survey rows (remaining untagged 'common' in survey range)
-- Survey max is ~2,345,063, which is below the foundation tail we already tagged
-- ============================================================================
UPDATE public.food_objects
SET source_dataset = 'survey'
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND source_type = 'common'  -- Survey should have been ingested as common
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint BETWEEN 320000 AND 2345100;  -- Survey range

-- ============================================================================
-- STEP 5: Tag remaining Foundation rows in overlapping region
-- Any remaining untagged 'common' rows in the foundation range are likely foundation
-- (after SR Legacy, branded, and survey have been tagged)
-- ============================================================================
UPDATE public.food_objects
SET source_dataset = 'foundation'
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL
  AND source_type = 'common'
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint >= 320000;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 1) Count by provider/type/dataset (main verification)
SELECT 
  source_provider, 
  source_type, 
  source_dataset, 
  count(*) as cnt
FROM public.food_objects
WHERE is_deleted = false
GROUP BY 1, 2, 3
ORDER BY cnt DESC;

-- 2) Ensure Foundation is now 'common' (should return 0)
SELECT count(*) as foundation_not_common
FROM public.food_objects
WHERE is_deleted = false 
  AND source_provider = 'usda' 
  AND source_dataset = 'foundation' 
  AND source_type != 'common';

-- 3) Check for any untagged USDA rows (should be 0)
SELECT count(*) as untagged_usda
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset IS NULL;

-- 4) Breakdown of USDA datasets with UPC stats
SELECT 
  source_dataset,
  source_type,
  count(*) as cnt,
  count(*) filter (where upc is not null) as with_upc,
  count(*) filter (where upc is null) as without_upc
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
GROUP BY source_dataset, source_type
ORDER BY source_dataset, source_type;

-- 5) Check for any remaining non-numeric source_ids (should be 0 after quarantine)
SELECT count(*) as non_numeric_source_ids
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_id !~ '^[0-9]+$';

-- 6) RISK AUDIT: Count branded rows with NULL UPC (normal, not an error)
-- This shows how many branded items don't have UPCs - important for understanding the data
SELECT 
  source_dataset,
  count(*) as total,
  count(*) filter (where upc is null) as null_upc_count,
  round(100.0 * count(*) filter (where upc is null) / count(*), 2) as null_upc_pct
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_type = 'branded'
GROUP BY source_dataset;

-- 7) Verify fdc_id ranges per dataset (sanity check)
SELECT 
  source_dataset,
  min(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as min_fdc_id,
  max(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as max_fdc_id,
  count(*) as cnt
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
GROUP BY source_dataset
ORDER BY min_fdc_id;

-- ============================================================================
-- EXPECTED RESULTS AFTER BACKFILL:
-- 
-- source_provider | source_type | source_dataset | cnt
-- ----------------|-------------|----------------|--------
-- usda            | branded     | branded        | ~340,000
-- usda            | common      | foundation     | ~78,000
-- usda            | common      | sr_legacy      | ~7,800
-- usda            | common      | survey         | ~5,500
-- null            | common      | null           | (seed data)
-- null            | user        | null           | (user foods)
--
-- NOTE: Foundation tail (fdc_id > 2,701,553) is the only segment we can
-- safely identify and fix if it was misclassified. Foundation rows in the
-- overlapping region (320k-2.7M) that were correctly ingested as 'common'
-- will be tagged in Step 5.
--
-- Quarantined rows (is_deleted=true):
-- - 39eee46d-de92-498d-8089-4e7792f75c84 (source_id=",11,2019-04-01")
-- ============================================================================

-- ============================================================================
-- Backfill quantity_g for existing journal entries
-- Run in Supabase Dashboard → SQL Editor AFTER addJournalEntryQuantityG.sql
--
-- Logic:
--   quantity_g = payload.quantity * payload.servingSizeG
--   Only for entries where both values are present and quantity_g is NULL.
--
-- This covers entries that were created before the quantity_g column existed.
-- Entries without servingSizeG in their payload remain NULL (conversion unavailable).
-- ============================================================================

-- Phase 1: Backfill from payload.servingSizeG (copied at log time)
UPDATE public.journal_entries
SET quantity_g = (payload->>'quantity')::numeric * (payload->>'servingSizeG')::numeric
WHERE quantity_g IS NULL
  AND (payload->>'quantity') IS NOT NULL
  AND (payload->>'servingSizeG') IS NOT NULL
  AND (payload->>'servingSizeG')::numeric > 0;

-- Phase 2: Backfill from linked food_objects.serving_size_g where payload
-- doesn't have servingSizeG but has a foodObjectId link.
UPDATE public.journal_entries je
SET quantity_g = COALESCE((je.payload->>'quantity')::numeric, 1) * fo.serving_size_g
FROM public.food_objects fo
WHERE je.quantity_g IS NULL
  AND je.payload->>'foodObjectId' IS NOT NULL
  AND fo.id = (je.payload->>'foodObjectId')::uuid
  AND fo.serving_size_g > 0;

-- Report results
DO $$
DECLARE
  total_entries INTEGER;
  backfilled_entries INTEGER;
  remaining_null INTEGER;
BEGIN
  SELECT count(*) INTO total_entries FROM public.journal_entries WHERE entry_type = 'intake';
  SELECT count(*) INTO backfilled_entries FROM public.journal_entries WHERE entry_type = 'intake' AND quantity_g IS NOT NULL;
  remaining_null := total_entries - backfilled_entries;
  
  RAISE NOTICE 'Backfill complete: % / % intake entries have quantity_g (% remaining NULL)',
    backfilled_entries, total_entries, remaining_null;
END $$;

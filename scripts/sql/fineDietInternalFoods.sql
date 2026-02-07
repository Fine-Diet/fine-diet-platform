-- ============================================================================
-- Fine Diet Internal Foods: Schema Updates & Merge Tracking
-- 
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- This migration:
-- 1. Adds verification tracking columns to food_objects
-- 2. Creates food_object_merges table for merge audit trail
-- 3. Adds helpful indexes for admin operations
-- 4. Documents source_provider values including 'fine_diet'
-- ============================================================================

-- ============================================================================
-- Part 1: Add verification tracking columns to food_objects
-- ============================================================================

-- Add verified_at column (when the food was verified)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add verified_by column (who verified it - references people.id for admin users)
-- IMPORTANT: The API sets verified_by = NULL because user.id from auth is auth.users.id,
-- not people.id. To properly set verified_by, you would need to look up:
--   SELECT id FROM people WHERE auth_user_id = <auth_user_id>
-- For now, verified_at and verification_notes provide sufficient audit trail.
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.people(id) ON DELETE SET NULL;

-- Add verification_notes column (admin notes about verification)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Add merged_into_food_object_id column (for losers in a merge, points to winner)
-- This makes it easy to trace where a deleted food was merged into
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS merged_into_food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL;

-- ============================================================================
-- Part 2: Document and ensure source_provider values
-- ============================================================================

-- source_provider accepted values:
-- 'usda'       - USDA FoodData Central (foundation, branded, sr_legacy, survey, fndds)
-- 'fine_diet'  - Fine Diet internal curated foods
-- 'user'       - User-created foods (person_id set)
-- 'scan'       - Scanned/provisional foods from barcode lookup
-- 'open_food_facts' - Open Food Facts database (if used)
-- 'internal'   - Legacy internal value (deprecated, use 'fine_diet')

-- Note: We don't add a CHECK constraint here to maintain flexibility,
-- but the code should use these values consistently.

COMMENT ON COLUMN public.food_objects.source_provider IS 
  'Source of food data: usda, fine_diet, user, scan, open_food_facts, internal (deprecated)';

-- ============================================================================
-- Part 3: Create food_object_merges table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.food_object_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The food that survives (winner)
  winner_food_object_id UUID NOT NULL REFERENCES public.food_objects(id) ON DELETE CASCADE,
  
  -- The food that was merged away (loser) - keeps reference even if loser is hard-deleted later
  loser_food_object_id UUID NOT NULL REFERENCES public.food_objects(id) ON DELETE SET NULL,
  
  -- Who performed the merge (admin user's person_id)
  -- Note: API sets this to NULL (same auth.users.id vs people.id issue as verified_by)
  -- The admin's auth_user_id is stored in metadata.admin_auth_user_id for audit trail
  merged_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  
  -- When the merge happened
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Why the merge was performed
  reason TEXT,
  
  -- Additional merge metadata (counts of references moved, etc.)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lookup and audit
CREATE INDEX IF NOT EXISTS idx_food_object_merges_winner 
  ON public.food_object_merges(winner_food_object_id);

CREATE INDEX IF NOT EXISTS idx_food_object_merges_loser 
  ON public.food_object_merges(loser_food_object_id);

CREATE INDEX IF NOT EXISTS idx_food_object_merges_merged_at 
  ON public.food_object_merges(merged_at DESC);

-- RLS for food_object_merges (admin read-only, service role full access)
ALTER TABLE public.food_object_merges ENABLE ROW LEVEL SECURITY;

-- Service role can manage all
CREATE POLICY "Service role can manage food_object_merges"
  ON public.food_object_merges FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.food_object_merges IS 
  'Audit trail for food object merges. Tracks when duplicates are merged, preserving history.';

-- ============================================================================
-- Part 4: Additional indexes for admin operations
-- ============================================================================

-- Composite index for filtering by provider, dataset, and deleted status
CREATE INDEX IF NOT EXISTS idx_food_objects_provider_dataset_deleted 
  ON public.food_objects(source_provider, source_dataset, is_deleted);

-- Index for UPC lookups (already exists, but ensure it's there)
-- CREATE INDEX IF NOT EXISTS idx_food_objects_upc ON public.food_objects(upc) WHERE upc IS NOT NULL;

-- Index for verified foods (for admin dashboard and search ranking)
CREATE INDEX IF NOT EXISTS idx_food_objects_verified 
  ON public.food_objects(is_verified) WHERE is_verified = true;

-- Index for Fine Diet internal foods specifically
CREATE INDEX IF NOT EXISTS idx_food_objects_fine_diet 
  ON public.food_objects(source_provider, is_deleted) 
  WHERE source_provider = 'fine_diet';

-- Composite index for admin list queries
CREATE INDEX IF NOT EXISTS idx_food_objects_admin_list 
  ON public.food_objects(source_provider, is_verified, updated_at DESC) 
  WHERE is_deleted = false;

-- ============================================================================
-- Part 5: Unique constraint for source_provider + source_id
-- ============================================================================

-- Ensure uniqueness of (source_provider, source_id) for non-deleted foods
-- This prevents duplicate imports and ensures stable IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_objects_provider_source_id_unique 
  ON public.food_objects(source_provider, source_id) 
  WHERE is_deleted = false AND source_id IS NOT NULL;

-- ============================================================================
-- Part 6: Helper function to update food_object references during merge
-- ============================================================================

-- Function to merge food references from loser to winner
-- Returns counts of updated records
CREATE OR REPLACE FUNCTION merge_food_object_references(
  p_winner_id UUID,
  p_loser_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_user_prefs_count INTEGER := 0;
  v_search_log_count INTEGER := 0;
  v_journal_entries_count INTEGER := 0;
  v_meal_templates_count INTEGER := 0;
BEGIN
  -- 1. Update user_food_preferences
  -- Note: If user already has a preference for winner, we need to merge the data
  -- For simplicity, we delete loser prefs if winner pref exists, otherwise update
  WITH deleted_dupes AS (
    DELETE FROM public.user_food_preferences
    WHERE food_object_id = p_loser_id
      AND person_id IN (
        SELECT person_id FROM public.user_food_preferences 
        WHERE food_object_id = p_winner_id
      )
    RETURNING id
  ),
  updated_prefs AS (
    UPDATE public.user_food_preferences
    SET food_object_id = p_winner_id, updated_at = now()
    WHERE food_object_id = p_loser_id
    RETURNING id
  )
  SELECT 
    (SELECT COUNT(*) FROM deleted_dupes) + (SELECT COUNT(*) FROM updated_prefs)
  INTO v_user_prefs_count;

  -- 2. Update food_search_log
  UPDATE public.food_search_log
  SET selected_food_id = p_winner_id
  WHERE selected_food_id = p_loser_id;
  GET DIAGNOSTICS v_search_log_count = ROW_COUNT;

  -- 3. Update journal_entries (JSONB payload.foodObjectId)
  UPDATE public.journal_entries
  SET 
    payload = jsonb_set(payload, '{foodObjectId}', to_jsonb(p_winner_id::text)),
    updated_at = now()
  WHERE payload->>'foodObjectId' = p_loser_id::text;
  GET DIAGNOSTICS v_journal_entries_count = ROW_COUNT;

  -- 4. Update journal_meal_templates (JSONB items array with foodObjectId)
  -- This updates each item in the items array that has the loser's foodObjectId
  UPDATE public.journal_meal_templates
  SET 
    items = (
      SELECT jsonb_agg(
        CASE 
          WHEN item->>'foodObjectId' = p_loser_id::text 
          THEN jsonb_set(item, '{foodObjectId}', to_jsonb(p_winner_id::text))
          ELSE item
        END
      )
      FROM jsonb_array_elements(items) AS item
    ),
    updated_at = now()
  WHERE items::text LIKE '%' || p_loser_id::text || '%';
  GET DIAGNOSTICS v_meal_templates_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'user_food_preferences', v_user_prefs_count,
    'food_search_log', v_search_log_count,
    'journal_entries', v_journal_entries_count,
    'journal_meal_templates', v_meal_templates_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION merge_food_object_references(UUID, UUID) TO service_role;

COMMENT ON FUNCTION merge_food_object_references IS 
  'Updates all references from loser food_object to winner during a merge. Returns counts of updated records.';

-- ============================================================================
-- Part 7: Function to get merge impact preview (dry run)
-- ============================================================================

CREATE OR REPLACE FUNCTION preview_food_object_merge(
  p_loser_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_user_prefs_count INTEGER;
  v_search_log_count INTEGER;
  v_journal_entries_count INTEGER;
  v_meal_templates_count INTEGER;
BEGIN
  -- Count user_food_preferences
  SELECT COUNT(*) INTO v_user_prefs_count
  FROM public.user_food_preferences
  WHERE food_object_id = p_loser_id;

  -- Count food_search_log
  SELECT COUNT(*) INTO v_search_log_count
  FROM public.food_search_log
  WHERE selected_food_id = p_loser_id;

  -- Count journal_entries
  SELECT COUNT(*) INTO v_journal_entries_count
  FROM public.journal_entries
  WHERE payload->>'foodObjectId' = p_loser_id::text;

  -- Count journal_meal_templates
  SELECT COUNT(*) INTO v_meal_templates_count
  FROM public.journal_meal_templates
  WHERE items::text LIKE '%' || p_loser_id::text || '%';

  RETURN jsonb_build_object(
    'user_food_preferences', v_user_prefs_count,
    'food_search_log', v_search_log_count,
    'journal_entries', v_journal_entries_count,
    'journal_meal_templates', v_meal_templates_count,
    'total', v_user_prefs_count + v_search_log_count + v_journal_entries_count + v_meal_templates_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION preview_food_object_merge(UUID) TO service_role;

COMMENT ON FUNCTION preview_food_object_merge IS 
  'Returns counts of references to a food_object (for merge dry-run preview).';

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Check new columns exist:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'food_objects' AND column_name IN ('verified_at', 'verified_by', 'verification_notes', 'merged_into_food_object_id');

-- Check food_object_merges table:
-- SELECT * FROM food_object_merges LIMIT 1;

-- Check indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'food_objects' AND indexname LIKE '%fine_diet%';

-- Test preview function:
-- SELECT preview_food_object_merge('00000000-0000-0000-0000-000000000000'::uuid);

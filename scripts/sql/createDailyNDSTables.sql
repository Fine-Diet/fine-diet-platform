-- ============================================================================
-- Create Daily NDS (Nutrition Density Score) Tables
-- ============================================================================
-- 
-- Creates tables for storing daily NDS scores and supporting NDS computation.
--
-- Key Tables:
-- 1. daily_nds - Daily rollup scores per person
-- 2. nds_recompute_queue - Queue for debounced recomputation
-- ============================================================================

-- ============================================================================
-- 1. Daily NDS Rollup Table
-- ============================================================================
-- Stores the daily NDS score and 7 subscores per person per day.
-- Unique constraint on (person_id, date_local).

CREATE TABLE IF NOT EXISTS public.daily_nds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  
  -- Main score (0-100)
  nds_score_100 NUMERIC(5,2) NOT NULL CHECK (nds_score_100 >= 0 AND nds_score_100 <= 100),
  
  -- Subscores (0-10 each)
  wfr_10 NUMERIC(4,2) NOT NULL CHECK (wfr_10 >= 0 AND wfr_10 <= 10),   -- Whole Food Ratio
  ps_10 NUMERIC(4,2) NOT NULL CHECK (ps_10 >= 0 AND ps_10 <= 10),      -- Protein Score
  pnd_10 NUMERIC(4,2) NOT NULL CHECK (pnd_10 >= 0 AND pnd_10 <= 10),   -- Phytonutrient Density
  fp_10 NUMERIC(4,2) NOT NULL CHECK (fp_10 >= 0 AND fp_10 <= 10),      -- Fiber Progress
  as_10 NUMERIC(4,2) NOT NULL CHECK (as_10 >= 0 AND as_10 <= 10),      -- Added Sugar
  mnc_10 NUMERIC(4,2) NOT NULL CHECK (mnc_10 >= 0 AND mnc_10 <= 10),   -- Micronutrient Coverage
  ob_10 NUMERIC(4,2) NOT NULL CHECK (ob_10 >= 0 AND ob_10 <= 10),      -- Omega Balance
  
  -- Debug/audit data (optional JSONB for detailed breakdown)
  debug_data JSONB,
  
  -- Versioning
  nds_version TEXT NOT NULL,        -- e.g., 'nds_daily_2026-02-08.v1'
  classifier_version TEXT NOT NULL, -- e.g., 'processing_classifier_2026-02-08.v1'
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one NDS record per person per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_nds_person_date 
ON public.daily_nds (person_id, date_local);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_daily_nds_date 
ON public.daily_nds (date_local);

-- Comment on table
COMMENT ON TABLE public.daily_nds IS 
  'Daily Nutrition Density Score rollups. One record per person per day. Subscores are 0-10, main score is 0-100.';

-- ============================================================================
-- 2. NDS Recompute Queue Table
-- ============================================================================
-- Queue for debounced NDS recomputation.
-- When a meal is logged/updated/deleted, an entry is added here.
-- A background job processes this queue to recompute daily_nds.

CREATE TABLE IF NOT EXISTS public.nds_recompute_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  
  -- Queue status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Tracking
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- For debouncing: when to actually process
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  
  -- Coalesce multiple mutations: only need one pending item per person/date
  UNIQUE (person_id, date_local, status) -- Prevents duplicate pending items
);

-- Index for finding work to do
CREATE INDEX IF NOT EXISTS idx_nds_queue_pending 
ON public.nds_recompute_queue (status, scheduled_for) 
WHERE status = 'pending';

-- Index for cleanup of old completed items
CREATE INDEX IF NOT EXISTS idx_nds_queue_completed 
ON public.nds_recompute_queue (completed_at) 
WHERE status = 'completed';

-- Comment on table
COMMENT ON TABLE public.nds_recompute_queue IS 
  'Queue for debounced NDS recomputation. Jobs are coalesced by (person_id, date_local).';

-- ============================================================================
-- 3. Trigger function for automatic queue insertion
-- ============================================================================
-- Automatically enqueue NDS recompute when journal_entries change.

CREATE OR REPLACE FUNCTION enqueue_nds_recompute()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  new_date DATE;
  person_uuid UUID;
  scheduled_time TIMESTAMPTZ;
BEGIN
  -- Schedule for 5 seconds from now (debounce window)
  scheduled_time := NOW() + INTERVAL '5 seconds';
  
  -- Note: We use UTC date here. The API layer handles user timezone mapping.
  -- This is acceptable because:
  -- 1. Most users' local dates align with UTC date for most of the day
  -- 2. Edge cases (late night entries) are handled by the wide query window in listEntriesByDay
  -- 3. The recompute fetches entries using the same timezone logic
  
  IF TG_OP = 'DELETE' THEN
    -- DELETE: enqueue for the deleted entry's date
    person_uuid := OLD.person_id;
    old_date := (OLD.occurred_at AT TIME ZONE 'UTC')::DATE;
    
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, old_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) 
    WHERE status = 'pending'
    DO UPDATE SET 
      scheduled_for = GREATEST(nds_recompute_queue.scheduled_for, scheduled_time),
      enqueued_at = NOW();
      
  ELSIF TG_OP = 'INSERT' THEN
    -- INSERT: enqueue for the new entry's date
    person_uuid := NEW.person_id;
    new_date := (NEW.occurred_at AT TIME ZONE 'UTC')::DATE;
    
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, new_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) 
    WHERE status = 'pending'
    DO UPDATE SET 
      scheduled_for = GREATEST(nds_recompute_queue.scheduled_for, scheduled_time),
      enqueued_at = NOW();
      
  ELSIF TG_OP = 'UPDATE' THEN
    -- UPDATE: enqueue for BOTH old and new dates if date changed
    person_uuid := NEW.person_id;
    old_date := (OLD.occurred_at AT TIME ZONE 'UTC')::DATE;
    new_date := (NEW.occurred_at AT TIME ZONE 'UTC')::DATE;
    
    -- Always enqueue for the new date
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, new_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) 
    WHERE status = 'pending'
    DO UPDATE SET 
      scheduled_for = GREATEST(nds_recompute_queue.scheduled_for, scheduled_time),
      enqueued_at = NOW();
    
    -- If date changed, also enqueue for the old date
    IF old_date <> new_date THEN
      INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
      VALUES (person_uuid, old_date, scheduled_time)
      ON CONFLICT (person_id, date_local, status) 
      WHERE status = 'pending'
      DO UPDATE SET 
        scheduled_for = GREATEST(nds_recompute_queue.scheduled_for, scheduled_time),
        enqueued_at = NOW();
    END IF;
  END IF;
  
  RETURN NULL; -- After trigger returns NULL
END;
$$ LANGUAGE plpgsql;

-- Create trigger on journal_entries
DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute ON public.journal_entries;

CREATE TRIGGER trigger_enqueue_nds_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION enqueue_nds_recompute();

COMMENT ON FUNCTION enqueue_nds_recompute() IS 
  'Automatically enqueue NDS recomputation when journal entries change. Debounces by 5 seconds.';

-- ============================================================================
-- 4. Add meal-derived fields to journal_entries
-- ============================================================================
-- These are computed synchronously on meal log mutation.

ALTER TABLE public.journal_entries 
ADD COLUMN IF NOT EXISTS protein_score_10 NUMERIC(4,2) CHECK (protein_score_10 >= 0 AND protein_score_10 <= 10);

COMMENT ON COLUMN public.journal_entries.protein_score_10 IS 
  'Meal protein score (0-10). Computed on entry create/update.';

ALTER TABLE public.journal_entries 
ADD COLUMN IF NOT EXISTS is_main_meal BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.journal_entries.is_main_meal IS 
  'True if meal has >= 250 kcal. Used for PS calculation.';

ALTER TABLE public.journal_entries 
ADD COLUMN IF NOT EXISTS meal_derived_data JSONB;

COMMENT ON COLUMN public.journal_entries.meal_derived_data IS 
  'JSONB with derived meal data: total_kcal, total_protein_g, psq_multiplier, etc.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check daily_nds table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'daily_nds'
ORDER BY ordinal_position;

-- Check nds_recompute_queue table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'nds_recompute_queue'
ORDER BY ordinal_position;

-- Check trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_enqueue_nds_recompute';

-- Check new columns on journal_entries
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'journal_entries'
  AND column_name IN ('protein_score_10', 'is_main_meal', 'meal_derived_data')
ORDER BY column_name;

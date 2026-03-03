-- ============================================================================
-- NDS Trigger: Only enqueue for intake entries
-- 
-- Run this migration to update enqueue_nds_recompute() so it only fires
-- when entry_type = 'intake'. Non-intake types (water, supplement, mood, etc.)
-- must NOT trigger NDS recomputation.
--
-- Run in Supabase SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_nds_recompute()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  new_date DATE;
  person_uuid UUID;
  scheduled_time TIMESTAMPTZ;
BEGIN
  -- Only enqueue for intake entries (food/drink). Non-intake types do not affect NDS.
  IF TG_OP = 'INSERT' THEN
    IF NEW.entry_type <> 'intake' THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.entry_type <> 'intake' AND OLD.entry_type <> 'intake' THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.entry_type <> 'intake' THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Schedule for 5 seconds from now (debounce window)
  scheduled_time := NOW() + INTERVAL '5 seconds';
  
  IF TG_OP = 'DELETE' THEN
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
    person_uuid := NEW.person_id;
    old_date := (OLD.occurred_at AT TIME ZONE 'UTC')::DATE;
    new_date := (NEW.occurred_at AT TIME ZONE 'UTC')::DATE;
    
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, new_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) 
    WHERE status = 'pending'
    DO UPDATE SET 
      scheduled_for = GREATEST(nds_recompute_queue.scheduled_for, scheduled_time),
      enqueued_at = NOW();
    
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
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enqueue_nds_recompute() IS 
  'Enqueue NDS recomputation only when intake entries change. Non-intake types (water, supplement, mood, etc.) do not trigger recompute.';

-- ============================================================================
-- Verification (manual)
-- 1. Add a mood entry → nds_recompute_queue should NOT get a new row.
-- 2. Add an intake entry → nds_recompute_queue should get a new row for that date.
-- ============================================================================

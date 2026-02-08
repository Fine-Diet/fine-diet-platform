-- ============================================================================
-- Patch: Update enqueue_nds_recompute trigger to handle date changes
-- ============================================================================
-- Run this AFTER the initial createDailyNDSTables.sql migration.
-- 
-- Fixes:
-- 1. UPDATE operations now enqueue BOTH old and new dates if date changed
-- 2. Better documentation of UTC date handling rationale
-- ============================================================================

-- Replace the trigger function with the improved version
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

COMMENT ON FUNCTION enqueue_nds_recompute() IS 
  'Automatically enqueue NDS recomputation when journal entries change. Debounces by 5 seconds. Handles date changes by enqueueing both old and new dates.';

-- Verify the function was updated
SELECT 'Trigger function updated successfully' AS status;

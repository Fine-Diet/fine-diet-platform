-- ============================================================================
-- Fix orphan 'running' row and inspect new skip counters
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Mark existing orphan stuck-in-running row as failed
UPDATE public.off_import_runs
SET
  status = 'failed',
  finished_at = COALESCE(finished_at, now()),
  error_summary = COALESCE(error_summary, 'Orphan: marked failed after patch (was stuck in running)')
WHERE status = 'running';

-- 2. Apply schema change if not already applied (add skip reason columns)
ALTER TABLE public.off_import_runs
  ADD COLUMN IF NOT EXISTS records_skipped_no_id INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_skipped_upsert_error INTEGER NOT NULL DEFAULT 0;

-- 3. Inspect runs (including new counters) after rerun
SELECT id, started_at, finished_at,
       records_seen, records_kept_us, records_inserted, records_updated,
       records_skipped, records_skipped_no_id, records_skipped_upsert_error,
       status, error_summary, source_file
FROM public.off_import_runs
ORDER BY started_at DESC
LIMIT 10;

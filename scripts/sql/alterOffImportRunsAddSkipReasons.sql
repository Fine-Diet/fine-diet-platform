-- ============================================================================
-- Add explicit skip reason columns to off_import_runs
-- Run after createOffMirrorTables.sql
-- ============================================================================

ALTER TABLE public.off_import_runs
  ADD COLUMN IF NOT EXISTS records_skipped_no_id INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_skipped_upsert_error INTEGER NOT NULL DEFAULT 0;

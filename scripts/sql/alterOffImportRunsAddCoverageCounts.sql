-- ============================================================================
-- Add coverage-first counters to off_import_runs
-- Run after createOffMirrorTables.sql
-- ============================================================================

ALTER TABLE public.off_import_runs
  ADD COLUMN IF NOT EXISTS records_kept_total INTEGER NOT NULL DEFAULT 0;

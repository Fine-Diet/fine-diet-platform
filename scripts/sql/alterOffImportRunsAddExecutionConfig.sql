-- ============================================================================
-- Add execution-config columns to off_import_runs
-- Run after createOffMirrorTables.sql
-- ============================================================================

ALTER TABLE public.off_import_runs
  ADD COLUMN IF NOT EXISTS max_kept_used INTEGER,
  ADD COLUMN IF NOT EXISTS batch_size_used INTEGER NOT NULL DEFAULT 500;

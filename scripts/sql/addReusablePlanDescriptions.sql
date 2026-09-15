-- ============================================================================
-- Add nullable description metadata to reusable Day Plans and Week Plans.
--
-- Existing rows remain valid with NULL description. Empty strings are not
-- stored at the application layer; this migration only adds the column.
-- ============================================================================

ALTER TABLE public.reusable_plan_day_templates
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE public.reusable_plan_week_patterns
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

COMMENT ON COLUMN public.reusable_plan_day_templates.description IS
  'Optional user-authored description for a reusable day plan. NULL when unset.';

COMMENT ON COLUMN public.reusable_plan_week_patterns.description IS
  'Optional user-authored description for a reusable week plan. NULL when unset.';

-- ============================================================================
-- Fix — blank Week Pattern date persistence
--
-- Blank week patterns have no calendar anchor (they are created without
-- reference to any dated plan days). The prior implementation wrote
-- positional labels like 'Day 1' / 'Day 7' into source_date_start /
-- source_date_end, which are typed as SQL DATE and reject non-date strings
-- outright ("invalid input syntax for type date"). This made blank Week
-- Pattern creation fail on every attempt.
--
-- Fix: allow NULL for these two columns so a pattern with no calendar
-- anchor can be represented truthfully (NULL), instead of coercing a label
-- into a typed date column. Per-day positional labels ("Day 1", etc.)
-- continue to live inside days_json (JSONB), which was never the problem.
-- ============================================================================

ALTER TABLE public.reusable_plan_week_patterns
  ALTER COLUMN source_date_start DROP NOT NULL,
  ALTER COLUMN source_date_end DROP NOT NULL;

COMMENT ON COLUMN public.reusable_plan_week_patterns.source_date_start IS
  'Calendar start date when this pattern was snapshotted from dated plan days. NULL for blank patterns with no calendar anchor.';
COMMENT ON COLUMN public.reusable_plan_week_patterns.source_date_end IS
  'Calendar end date when this pattern was snapshotted from dated plan days. NULL for blank patterns with no calendar anchor.';

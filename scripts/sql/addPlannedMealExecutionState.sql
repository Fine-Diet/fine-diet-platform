-- Packet 39 — Plan-to-Journal Execution and Consumption Truth
--
-- Adds execution state to planned_meals so the day view can reflect
-- whether a meal is still upcoming, has been logged to Journal, or
-- was skipped. Adds a back-link to the resulting journal_entry so the
-- user can navigate from the plan directly into their consumption record.
--
-- Preserves planned truth: the planned_meal payload is NEVER modified
-- by execution; it always reflects what was planned. The journal_entry
-- contains the actual intake recorded at execution time (which may differ
-- from the plan if the user adjusted serving amount at log time).
--
-- Run once against the production database.
-- Idempotent: IF NOT EXISTS / column presence checks protect re-runs.

ALTER TABLE public.planned_meals
  ADD COLUMN IF NOT EXISTS execution_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (execution_state IN ('pending', 'eaten', 'skipped')),
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.planned_meals.execution_state IS
  'Execution state: pending (not yet acted on), eaten (logged to Journal), skipped (intentionally not eaten).';

COMMENT ON COLUMN public.planned_meals.journal_entry_id IS
  'FK to journal_entries created when execution_state=eaten. NULL for pending/skipped. Set NULL on entry delete (ON DELETE SET NULL).';

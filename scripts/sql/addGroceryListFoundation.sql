-- ============================================================================
-- Persistent Grocery Lists v1 — Grocery List object foundation (v2, corrected)
--
-- Additive migration. Evolves `generated_grocery_lists` from a
-- plan/date-scope-only generation output into a first-class persistent
-- object (default running list + user-named lists), independent of any one
-- plan. Also adds item-level provenance and a contributor-membership table
-- so the schema is ready for future family collaboration without shipping
-- any collaboration UI yet.
--
-- v2 correction (superseding the original draft shipped unapplied in
-- PR #151): the original draft introduced an unconstrained
-- `owner_type` + `owner_id` pair as the v1 ownership boundary. That pair
-- was never protected by RLS `WITH CHECK` on write, which would have let a
-- malicious client assign a list to another person's `owner_id`. This
-- version removes that column pair entirely. `person_id` (already present,
-- already the sole subject of every RLS policy on these tables since their
-- original creation) remains the one enforceable owner column for v1.
-- Future collaboration is schema-ready via `grocery_list_contributors`
-- (still schema-only — no collaborator RLS access ships in this packet).
--
-- Design rules:
--   - Additive only. No columns are dropped, no rows are deleted.
--   - `plan_id` becomes optional (a list may exist with no plan behind it) —
--     it is already nullable in production, so this is a documented no-op.
--   - `person_id` is the sole owner/security boundary. No second identity
--     column is introduced.
--   - `status` gains two new allowed values ('active', 'archived') alongside
--     the existing generation-workflow values ('draft', 'finalized',
--     'exported'); no existing row's status value changes.
--   - At most one *active* default list per person, enforced via a partial
--     unique index (not a NOT NULL/UNIQUE column), so it never blocks
--     archived history.
--   - UPDATE policies gain `WITH CHECK` mirroring `USING`, closing a
--     pre-existing gap (previously `USING`-only) where a row could in
--     theory be re-parented to a different `person_id` on update.
--   - Every DDL statement in this script is safe to run more than once:
--     `IF NOT EXISTS`/`IF EXISTS` guards throughout, and every
--     `CREATE POLICY` is preceded by a matching `DROP POLICY IF EXISTS`
--     (Postgres has no `CREATE POLICY IF NOT EXISTS`). Statically re-audited
--     top to bottom for this property as part of the v2 review fixes.
--
-- Rollback: see scripts/sql/rollbackGroceryListFoundation.sql
--
-- Migration gate: this script has NOT been applied to production or to any
-- Supabase branch. It is checked in for review only, per the review-first
-- packet contract. Do not apply without explicit approval.
--
-- Run this migration in Supabase SQL Editor:
--   1. Copy entire script
--   2. Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- generated_grocery_lists: persistent list identity
-- ----------------------------------------------------------------------------

-- Already nullable in production; kept as a documented no-op so this script
-- is idempotent/safe to run against environments where it isn't yet.
ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.generated_grocery_lists
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill created_by_person_id from the existing person_id so every
-- pre-existing row is immediately valid under the new model.
UPDATE public.generated_grocery_lists
SET created_by_person_id = person_id
WHERE created_by_person_id IS NULL;

-- Widen status lifecycle to cover persistent (non-generation-workflow) lists.
ALTER TABLE public.generated_grocery_lists
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_status_check;
ALTER TABLE public.generated_grocery_lists
  ADD CONSTRAINT generated_grocery_lists_status_check
    CHECK (status IN ('draft', 'finalized', 'exported', 'active', 'archived'));

-- At most one non-archived default list per person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_lists_person_default
  ON public.generated_grocery_lists (person_id)
  WHERE is_default = TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grocery_lists_person_updated
  ON public.generated_grocery_lists (person_id, updated_at DESC);

COMMENT ON COLUMN public.generated_grocery_lists.is_default IS
  'True for the single running "My Grocery List" per person. Enforced unique via idx_grocery_lists_person_default.';
COMMENT ON COLUMN public.generated_grocery_lists.person_id IS
  'Sole owner/security boundary for this list. Every RLS policy on this table scopes by person_id; no owner_type/owner_id pair is used.';
COMMENT ON COLUMN public.generated_grocery_lists.plan_id IS
  'Optional. NULL for persistent default/named lists not derived from a single plan. Plan-derived generation batches within a persistent list record their plan/date scope on grocery_items.source_id / source_detail_json instead of on the list row.';

-- Harden UPDATE RLS: mirror USING in WITH CHECK so a row can never be
-- re-parented to a different person_id via a client-supplied update payload.
DROP POLICY IF EXISTS "Users can update own grocery_lists" ON public.generated_grocery_lists;
CREATE POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  FOR UPDATE
  USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- grocery_list_contributors: future family collaboration, schema-only
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_list_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('owner', 'contributor')),
  can_add BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_check_off BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_list_contributors_list_person_unique
    UNIQUE (grocery_list_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_list_contributors_list
  ON public.grocery_list_contributors (grocery_list_id);

CREATE INDEX IF NOT EXISTS idx_grocery_list_contributors_person
  ON public.grocery_list_contributors (person_id);

COMMENT ON TABLE public.grocery_list_contributors IS
  'Future family/contributor membership for a Grocery List. No collaboration UI or RLS-granted collaborator access ships in this packet — schema exists to prevent a later rewrite. Access remains person_id-only until an explicit follow-up packet.';

ALTER TABLE public.grocery_list_contributors ENABLE ROW LEVEL SECURITY;

-- Access intentionally stays owner-only (person_id on the parent list) for
-- v1. Contributors do not yet gain read/write access via this table.
-- DROP POLICY IF EXISTS guards make this block safely re-runnable —
-- CREATE POLICY alone would fail on a second run with "policy already
-- exists".
DROP POLICY IF EXISTS "List owners can read their contributor rows" ON public.grocery_list_contributors;
CREATE POLICY "List owners can read their contributor rows" ON public.grocery_list_contributors
  FOR SELECT TO authenticated USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "List owners can insert contributor rows" ON public.grocery_list_contributors;
CREATE POLICY "List owners can insert contributor rows" ON public.grocery_list_contributors
  FOR INSERT TO authenticated WITH CHECK (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "List owners can update contributor rows" ON public.grocery_list_contributors;
CREATE POLICY "List owners can update contributor rows" ON public.grocery_list_contributors
  FOR UPDATE TO authenticated
  USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "List owners can delete contributor rows" ON public.grocery_list_contributors;
CREATE POLICY "List owners can delete contributor rows" ON public.grocery_list_contributors
  FOR DELETE TO authenticated USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );

DROP TRIGGER IF EXISTS grocery_list_contributors_updated_at ON public.grocery_list_contributors;
CREATE TRIGGER grocery_list_contributors_updated_at BEFORE UPDATE ON public.grocery_list_contributors
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- grocery_items: item-level provenance
-- ----------------------------------------------------------------------------

ALTER TABLE public.grocery_items
  ADD COLUMN IF NOT EXISTS added_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_detail_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.grocery_items
  DROP CONSTRAINT IF EXISTS grocery_items_source_type_check;
ALTER TABLE public.grocery_items
  ADD CONSTRAINT grocery_items_source_type_check
    CHECK (source_type IN ('manual', 'planned_meal', 'food_recommendation', 'pantry_restocks', 'recipe', 'system'));

-- Backfill: rows with source_planned_meal_ids populated came from plan
-- derivation; everything else is conservatively treated as manual since
-- there is no other evidence of its origin.
UPDATE public.grocery_items
SET source_type = 'planned_meal'
WHERE source_planned_meal_ids IS NOT NULL AND array_length(source_planned_meal_ids, 1) IS NOT NULL;

UPDATE public.grocery_items
SET added_by_person_id = person_id
WHERE added_by_person_id IS NULL;

COMMENT ON COLUMN public.grocery_items.source_type IS
  'Generalized provenance vocabulary (manual, planned_meal, food_recommendation, pantry_restocks, recipe, system). Supplements, does not replace, source_planned_meal_ids — planned_meal rows keep exact meal-level traceability there.';
COMMENT ON COLUMN public.grocery_items.source_id IS
  'Free-form scalar identifying the source record for this contribution, e.g. the plan_id for a planned_meal-sourced batch. Interpretation depends on source_type.';
COMMENT ON COLUMN public.grocery_items.source_detail_json IS
  'Additional source context, e.g. {"date_range_start":"...","date_range_end":"..."} for a planned_meal reconciliation batch into a persistent list.';

-- Harden UPDATE RLS: mirror USING in WITH CHECK so a row can never be
-- re-parented to a different person_id via a client-supplied update payload.
DROP POLICY IF EXISTS "Users can update own grocery_items" ON public.grocery_items;
CREATE POLICY "Users can update own grocery_items" ON public.grocery_items
  FOR UPDATE
  USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- ============================================================================
-- Verification queries
-- ============================================================================

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'generated_grocery_lists'
--     AND column_name IN ('is_default','created_by_person_id','archived_at')
--   ORDER BY column_name;

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'grocery_items'
--     AND column_name IN ('added_by_person_id','source_type','source_id','source_detail_json')
--   ORDER BY column_name;

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'grocery_list_contributors';

-- No owner_type/owner_id columns should exist on generated_grocery_lists:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'generated_grocery_lists' AND column_name IN ('owner_type','owner_id');
-- -- must return zero rows

-- At most one active default list per person:
-- SELECT person_id, count(*) FROM public.generated_grocery_lists
--   WHERE is_default = true AND archived_at IS NULL
--   GROUP BY person_id HAVING count(*) > 1; -- must return zero rows

-- UPDATE policies now carry WITH CHECK (person_id-scoped) on both tables:
-- SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename IN ('generated_grocery_lists','grocery_items') AND cmd = 'UPDATE';
-- -- with_check must be non-null and person_id-scoped for both rows

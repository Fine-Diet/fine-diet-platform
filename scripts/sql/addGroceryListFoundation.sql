-- ============================================================================
-- Persistent Grocery Lists v1 — Grocery List object foundation (hardened v2)
--
-- Evolves `generated_grocery_lists` from a plan/date-scope-only generation
-- output into a first-class persistent object (default running list + user-
-- named lists), independent of any one plan. Also adds item-level provenance
-- and a contributor-membership table so the schema is ready for future
-- family collaboration without shipping any collaboration UI yet.
--
-- STATUS: NOT APPLIED. Drafted for review only. Do not run this against any
-- Supabase environment (including a disposable branch) without separate,
-- explicit approval — see the "Migration risk" section of the execution
-- report this script ships with.
--
-- Supersedes the v1 draft (same filename, prior version) after auditing the
-- live schema of Supabase project tssvlflebugqhtogqdfs. Live findings that
-- changed this version vs. v1:
--   - `generated_grocery_lists.plan_id` is ALREADY nullable in production.
--     The `DROP NOT NULL` statement below is kept as a documented no-op for
--     environments where it might not be (defensive; verified harmless to
--     re-run on an already-nullable column).
--   - `generated_grocery_lists` UPDATE policy uses USING only, no WITH
--     CHECK — hardened below.
--   - `grocery_items` UPDATE policy uses USING only, no WITH CHECK —
--     hardened below.
--   - All 781 existing `grocery_items` rows already carry non-empty
--     `source_planned_meal_ids` (100% plan-derived today), so the
--     `source_type` backfill is expected to affect 0 rows on this
--     database; it is kept for correctness on any environment where that
--     is not true, and is idempotent.
--   - RLS is already enabled (relrowsecurity=true) on both tables with
--     person-owned SELECT/INSERT/UPDATE/DELETE policies (roles: public).
--     This migration does not change table-level RLS enablement or the
--     `public` role target of pre-existing policies (only adds a missing
--     WITH CHECK clause to the existing UPDATE policies) — new tables use
--     explicit `TO authenticated` role targets per the hardening request.
--
-- Design rules (unchanged from v1):
--   - Additive only. No columns are dropped, no rows are deleted.
--   - `plan_id` remains optional (a list may exist with no plan behind it).
--   - `owner_id` defaults from `person_id` for all existing rows, so every
--     existing list keeps working unchanged. Ownership transfer to a
--     different person than the creator is NOT implemented by this packet;
--     `owner_id` exists to avoid a later rewrite when collaboration ships.
--   - `status` gains two new allowed values ('active', 'archived') alongside
--     the existing generation-workflow values ('draft', 'finalized',
--     'exported'); no existing row's status value changes.
--   - At most one *active* default list per owner, enforced via a partial
--     unique index (not a NOT NULL/UNIQUE column), so it never blocks
--     archived history.
--   - Every DDL statement below is safe to re-run (IF NOT EXISTS / IF
--     EXISTS guards, or naturally idempotent UPDATEs) so a partially-applied
--     run can simply be re-run to completion rather than requiring manual
--     cleanup.
--
-- Rollback: see scripts/sql/rollbackGroceryListFoundation.sql. Rollback
-- limitations are documented there and in the execution report.
--
-- Data-impact report (as of this audit, project tssvlflebugqhtogqdfs):
--   - generated_grocery_lists: 21 rows, all status='draft', all plan-derived
--     (plan_id set). All 21 will be backfilled with owner_id=person_id and
--     created_by_person_id=person_id; no existing column value changes.
--   - grocery_items: 781 rows, all plan-derived (source_planned_meal_ids
--     non-empty). All 781 will be backfilled with added_by_person_id=
--     person_id and source_type='plan_derived' (already the column default,
--     so this is a no-op in practice but included for correctness).
--   - No row is deleted, re-parented, or has an existing column value
--     changed by this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- generated_grocery_lists: persistent list identity
-- ----------------------------------------------------------------------------

-- No-op on this database today (plan_id is already nullable) — kept so this
-- migration is portable/idempotent across environments.
ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.generated_grocery_lists
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill new identity columns from the existing person_id so every
-- pre-existing row is immediately valid under the new model. Idempotent:
-- only touches rows where the target column is still NULL.
UPDATE public.generated_grocery_lists
SET owner_id = person_id
WHERE owner_id IS NULL;

UPDATE public.generated_grocery_lists
SET created_by_person_id = person_id
WHERE created_by_person_id IS NULL;

ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN owner_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_grocery_lists_owner_type_check'
  ) THEN
    ALTER TABLE public.generated_grocery_lists
      ADD CONSTRAINT generated_grocery_lists_owner_type_check
        CHECK (owner_type IN ('person'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_grocery_lists_owner_id_fkey'
  ) THEN
    ALTER TABLE public.generated_grocery_lists
      ADD CONSTRAINT generated_grocery_lists_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.people(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Widen status lifecycle to cover persistent (non-generation-workflow) lists.
ALTER TABLE public.generated_grocery_lists
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_status_check;
ALTER TABLE public.generated_grocery_lists
  ADD CONSTRAINT generated_grocery_lists_status_check
    CHECK (status IN ('draft', 'finalized', 'exported', 'active', 'archived'));

-- At most one non-archived default list per owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_lists_owner_default
  ON public.generated_grocery_lists (owner_id)
  WHERE is_default = TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grocery_lists_owner_updated
  ON public.generated_grocery_lists (owner_id, updated_at DESC);

COMMENT ON COLUMN public.generated_grocery_lists.is_default IS
  'True for the single running "My Grocery List" per owner. Enforced unique via idx_grocery_lists_owner_default.';
COMMENT ON COLUMN public.generated_grocery_lists.owner_id IS
  'Current owning person. Same as person_id today; kept distinct so ownership can evolve independently of the original creator.';
COMMENT ON COLUMN public.generated_grocery_lists.plan_id IS
  'Optional. NULL for persistent default/named lists not derived from a single plan.';

-- ----------------------------------------------------------------------------
-- Harden existing RLS: add WITH CHECK to UPDATE policies (USING-only today).
--
-- Without WITH CHECK, a permitted UPDATE's *new* row is not re-validated
-- against the policy predicate, which is the standard vector for a caller
-- re-parenting a row to a different person_id via UPDATE. Mirrors the
-- existing USING predicate exactly — no behavior change for legitimate
-- self-scoped updates, only closes the re-parenting gap. Table-level RLS
-- enablement and all other policies (SELECT/INSERT/DELETE, `public` role
-- target) are unchanged.
-- ----------------------------------------------------------------------------

ALTER POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

ALTER POLICY "Users can update own grocery_items" ON public.grocery_items
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

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
  'Future family/contributor membership for a Grocery List. No collaboration UI ships in this packet — schema exists to prevent a later rewrite.';

ALTER TABLE public.grocery_list_contributors ENABLE ROW LEVEL SECURITY;

-- New table: explicit role targets (TO authenticated) per hardening request,
-- rather than the codebase's older `public`-role pattern used on
-- generated_grocery_lists / grocery_items.
DROP POLICY IF EXISTS "Users can read own contributor rows or rows on owned lists" ON public.grocery_list_contributors;
CREATE POLICY "Users can read own contributor rows or rows on owned lists" ON public.grocery_list_contributors
  FOR SELECT TO authenticated USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    OR grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can insert contributor rows on owned lists" ON public.grocery_list_contributors;
CREATE POLICY "Owners can insert contributor rows on owned lists" ON public.grocery_list_contributors
  FOR INSERT TO authenticated WITH CHECK (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can update contributor rows on owned lists" ON public.grocery_list_contributors;
CREATE POLICY "Owners can update contributor rows on owned lists" ON public.grocery_list_contributors
  FOR UPDATE TO authenticated USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  ) WITH CHECK (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can delete contributor rows on owned lists" ON public.grocery_list_contributors;
CREATE POLICY "Owners can delete contributor rows on owned lists" ON public.grocery_list_contributors
  FOR DELETE TO authenticated USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
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
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'plan_derived',
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_detail_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grocery_items_source_type_check'
  ) THEN
    ALTER TABLE public.grocery_items
      ADD CONSTRAINT grocery_items_source_type_check
        CHECK (source_type IN ('plan_derived', 'pantry_gap', 'recommendation', 'recipe', 'manual'));
  END IF;
END $$;

-- Backfill: existing rows with no source_planned_meal_ids were added by hand,
-- not derived from a plan. Verified 0 rows match this on the audited
-- database (all 781 existing items are plan-derived) — kept for correctness
-- on any environment where that is not true. Idempotent (re-running has no
-- further effect once applied).
UPDATE public.grocery_items
SET source_type = 'manual'
WHERE source_planned_meal_ids IS NULL OR array_length(source_planned_meal_ids, 1) IS NULL;

UPDATE public.grocery_items
SET added_by_person_id = person_id
WHERE added_by_person_id IS NULL;

COMMENT ON COLUMN public.grocery_items.source_type IS
  'Generalized provenance. plan_derived items also carry source_planned_meal_ids for exact traceability.';

-- ============================================================================
-- Verification queries — run after applying, expect the results noted.
-- ============================================================================

-- Expect: is_default, owner_type, owner_id, created_by_person_id, archived_at
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'generated_grocery_lists'
--     AND column_name IN ('is_default','owner_type','owner_id','created_by_person_id','archived_at')
--   ORDER BY column_name;

-- Expect: added_by_person_id, source_detail_json, source_id, source_type
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'grocery_items'
--     AND column_name IN ('added_by_person_id','source_type','source_id','source_detail_json')
--   ORDER BY column_name;

-- Expect: 1 row (grocery_list_contributors)
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'grocery_list_contributors';

-- Expect: 0 rows (no owner has more than one active default list)
-- SELECT owner_id, count(*) FROM public.generated_grocery_lists
--   WHERE is_default = true AND archived_at IS NULL
--   GROUP BY owner_id HAVING count(*) > 1;

-- Expect: 0 rows where owner_id IS NULL (every row backfilled)
-- SELECT count(*) FROM public.generated_grocery_lists WHERE owner_id IS NULL;

-- Expect: 0 rows where added_by_person_id IS NULL (every row backfilled)
-- SELECT count(*) FROM public.grocery_items WHERE added_by_person_id IS NULL;

-- Expect: both UPDATE policies now show a non-null with_check
-- SELECT tablename, policyname, qual, with_check FROM pg_policies
--   WHERE tablename IN ('generated_grocery_lists','grocery_items') AND cmd = 'UPDATE';

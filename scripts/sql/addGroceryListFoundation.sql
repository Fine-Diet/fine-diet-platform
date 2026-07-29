-- ============================================================================
-- Persistent Grocery Lists v1 — Grocery List object foundation (hardened v3)
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
-- v3 correction (security review on PR #152, generated document/review note
-- f988e71f-c9e8-495d-bcfd-fa8e6c53a7df): v2 added `owner_id` but left the
-- existing INSERT/UPDATE RLS policies checking only `person_id`. Because
-- groceryListService (application code) scopes every owner-facing read and
-- write by `owner_id` using the Supabase service-role client (which bypasses
-- RLS), a caller hitting Supabase directly with their own authenticated
-- session could INSERT or UPDATE a row with `person_id` = themself (passes
-- the old policy) but `owner_id` = a different person's `people.id` (not
-- checked at all) — and that row would then surface inside the victim's
-- owner-scoped list queries server-side. Fixed by:
--   - A `CHECK (owner_id = person_id)` constraint — the primary defense,
--     enforced by Postgres independently of any RLS policy, application
--     code, or future policy regression. Explicitly a v1-only invariant:
--     ownership transfer/collaboration is not implemented yet, so the two
--     identifiers are required to always match. Drop this constraint (and
--     only this constraint) when collaboration ships and owner_id is
--     allowed to diverge from the original creator.
--   - Hardened INSERT/UPDATE RLS (defense in depth): both policies now
--     additionally require `owner_id` to resolve to the caller's own
--     `people.id` and `owner_type = 'person'`, and UPDATE's `USING` clause
--     was extended to match its `WITH CHECK` clause.
--
-- Supersedes the v1 draft (same filename, prior version) after auditing the
-- live schema of Supabase project tssvlflebugqhtogqdfs. Live findings that
-- changed this version vs. v1:
--   - `generated_grocery_lists.plan_id` is ALREADY nullable in production.
--     The `DROP NOT NULL` statement below is kept as a documented no-op for
--     environments where it might not be (defensive; verified harmless to
--     re-run on an already-nullable column).
--   - `generated_grocery_lists` INSERT/UPDATE policies check `person_id`
--     only, and UPDATE has no `WITH CHECK` at all — both hardened below
--     (see "v3 correction" above for the INSERT/UPDATE/owner_id gap).
--   - `grocery_items` UPDATE policy uses USING only, no WITH CHECK —
--     hardened below. (`grocery_items` has no `owner_id` column and is not
--     affected by the v3 gap — it remains scoped by `person_id` only, in
--     both RLS and groceryListService.)
--   - All 781 existing `grocery_items` rows already carry non-empty
--     `source_planned_meal_ids` (100% plan-derived today), so the
--     `source_type` backfill is expected to affect 0 rows on this
--     database; it is kept for correctness on any environment where that
--     is not true, and is idempotent.
--   - RLS is already enabled (relrowsecurity=true) on both tables with
--     person-owned SELECT/INSERT/UPDATE/DELETE policies (roles: public).
--     Both `anon` and `authenticated` currently hold direct table-level
--     INSERT/UPDATE/DELETE grants on both tables (Supabase's default grant
--     pattern) — RLS is the only thing preventing `anon` from touching rows
--     today, since `auth.uid()` is NULL for an unauthenticated request and
--     no `people` row matches. This migration does not change those grants
--     (out of scope per the review note — no grant overhaul), but see
--     "Recommended follow-up (not in this packet)" below.
--     This migration does not change table-level RLS enablement or the
--     `public` role target of pre-existing policies — new tables use
--     explicit `TO authenticated` role targets per the hardening request.
--
-- Recommended follow-up (not in this packet): revoke the direct `anon`
-- INSERT/UPDATE/DELETE table-level grants on `generated_grocery_lists` and
-- `grocery_items`, since anon traffic has no legitimate write path to
-- either table and today's posture relies solely on RLS predicates
-- evaluating false for an unauthenticated `auth.uid()`. This is a
-- grant-hygiene change (REVOKE, not a policy change) that is out of scope
-- for this additive, policy-only migration and should be scoped/reviewed
-- separately, ideally alongside an audit of grants on other
-- person-scoped tables for the same pattern.
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

  -- v1-only invariant (see "v3 correction" note above): ownership transfer
  -- is not implemented yet, so owner_id and person_id must always match.
  -- This is the primary defense against the cross-owner gap found in
  -- review — it holds even if a future RLS policy regresses, and even for
  -- writes made through the service-role client. Drop this constraint (and
  -- only this constraint — no other change) in the migration that
  -- introduces real ownership transfer / collaboration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_grocery_lists_owner_id_matches_person_id_v1_check'
  ) THEN
    ALTER TABLE public.generated_grocery_lists
      ADD CONSTRAINT generated_grocery_lists_owner_id_matches_person_id_v1_check
        CHECK (owner_id = person_id);
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
  'Current owning person. Must equal person_id today (enforced by generated_grocery_lists_owner_id_matches_person_id_v1_check) — kept as a distinct column so ownership can evolve independently of the original creator once that constraint is lifted for collaboration.';
COMMENT ON COLUMN public.generated_grocery_lists.plan_id IS
  'Optional. NULL for persistent default/named lists not derived from a single plan.';

-- ----------------------------------------------------------------------------
-- Harden existing RLS.
--
-- (1) generated_grocery_lists INSERT/UPDATE: the pre-existing policies check
--     only person_id, which is not what the application (groceryListService,
--     via the service-role client) actually scopes ownership by — that's
--     owner_id. Both policies are extended to also require owner_id to
--     resolve to the caller's own people.id and owner_type = 'person', so an
--     authenticated caller writing directly to Postgres (bypassing the app's
--     API) cannot create or re-parent a row into another person's
--     owner-scoped view. Backed independently by the
--     generated_grocery_lists_owner_id_matches_person_id_v1_check constraint
--     added above. UPDATE's USING clause is also extended to match its WITH
--     CHECK clause (previously USING checked person_id only).
--
-- (2) grocery_items UPDATE: add WITH CHECK (USING-only today). Without WITH
--     CHECK, a permitted UPDATE's *new* row is not re-validated against the
--     policy predicate, which is the standard vector for a caller
--     re-parenting a row to a different person_id via UPDATE. Mirrors the
--     existing USING predicate exactly. grocery_items has no owner_id column
--     and is unaffected by the owner_id gap described above — it stays
--     person_id-scoped, consistent with groceryListService's item queries.
--
-- Table-level RLS enablement and all other policies (SELECT/DELETE, `public`
-- role target) are unchanged.
-- ----------------------------------------------------------------------------

ALTER POLICY "Users can insert own grocery_lists" ON public.generated_grocery_lists
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    AND owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    AND owner_type = 'person'
  );

ALTER POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    AND owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    AND owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    AND owner_type = 'person'
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

-- ----------------------------------------------------------------------------
-- Cross-owner authorization verification (v3 correction). Run all of these
-- after applying, on a disposable branch only — they prove the specific gap
-- from review note f988e71f-c9e8-495d-bcfd-fa8e6c53a7df is closed.
-- ----------------------------------------------------------------------------

-- (a) Static check — confirm INSERT/UPDATE policies now reference owner_id,
-- not just person_id. Expect both rows' with_check text to contain
-- "owner_id" and "owner_type".
-- SELECT tablename, policyname, cmd, with_check FROM pg_policies
--   WHERE tablename = 'generated_grocery_lists' AND cmd IN ('INSERT','UPDATE');

-- (b) Static check — confirm the v1 ownership-invariant constraint exists.
-- Expect 1 row.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'generated_grocery_lists_owner_id_matches_person_id_v1_check';

-- (c) Constraint-level proof (works under any role, including the
-- service-role client — this is what actually protects groceryListService's
-- owner_id-scoped queries regardless of which RLS policy is in effect).
-- Expect: ERROR - new row for relation "generated_grocery_lists" violates
-- check constraint "generated_grocery_lists_owner_id_matches_person_id_v1_check".
-- INSERT INTO public.generated_grocery_lists
--   (person_id, owner_id, owner_type, title, mode, status, is_default)
--   VALUES (
--     (SELECT id FROM public.people LIMIT 1),
--     (SELECT id FROM public.people OFFSET 1 LIMIT 1),
--     'person', 'v1-invariant-probe', 'manual', 'active', false
--   );

-- (d) RLS-level proof, run as an authenticated role impersonating a real
-- test person (requires `SET request.jwt.claims` / `SET ROLE authenticated`
-- with a session `auth.uid()` matching a seeded people.auth_user_id — do
-- this via the Supabase SQL editor's "Run as" feature or a short-lived test
-- JWT, not as the postgres/service_role connection this script otherwise
-- assumes). With person A impersonated:
--   1. INSERT into generated_grocery_lists with person_id = A, owner_id = B
--      (a different real person). Expect: rejected by the hardened INSERT
--      policy's WITH CHECK (in addition to (c) above).
--   2. As A, UPDATE an existing list A owns, setting owner_id = B. Expect:
--      rejected by the hardened UPDATE policy's WITH CHECK.
--   3. As A, INSERT/UPDATE with person_id = A, owner_id = A (matching).
--      Expect: succeeds — legitimate self-scoped writes are unaffected.
-- This is the check that most directly emulates the reviewed threat
-- (a caller with a real authenticated session bypassing the app's API), and
-- should be run manually on the disposable branch before this migration is
-- considered verified, in addition to (c)'s automated constraint proof.

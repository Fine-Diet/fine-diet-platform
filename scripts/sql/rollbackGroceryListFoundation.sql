-- ============================================================================
-- Rollback for scripts/sql/addGroceryListFoundation.sql (hardened v3)
--
-- v3 addition: also restores the original INSERT policy (v3 added an
-- owner_id + owner_type check on top of the pre-existing person_id check)
-- and drops the temporary v1 ownership-invariant constraint
-- (generated_grocery_lists_owner_id_matches_person_id_v1_check), in addition
-- to everything v2's rollback already covered.
--
-- Rollback limitations (read before running):
--   1. Re-adding NOT NULL on plan_id will FAIL if any list now has a NULL
--      plan_id (i.e. a persistent default/named list was created after this
--      migration was applied). Resolve those rows first — either delete
--      them (if truly disposable, e.g. a test/QA environment) or manually
--      backfill a plan_id (not generally meaningful for a persistent list,
--      so deletion is the realistic option in practice).
--   2. Dropping grocery_list_contributors deletes any contributor rows that
--      exist. There is no contributor UI in this packet, so this table is
--      expected to be empty, but this is a real, unrecoverable data loss if
--      something has written to it out-of-band.
--   3. Dropping the provenance columns on grocery_items
--      (added_by_person_id, source_type, source_id, source_detail_json)
--      loses any values written to them, including on plan-derived rows
--      created after this migration (their source_type would simply have
--      been 'plan_derived', the same as the pre-migration implicit
--      behavior, so this loss is low-impact for plan-derived rows
--      specifically).
--   4. Reverting the UPDATE-policy WITH CHECK hardening below restores the
--      exact pre-migration policy definitions (USING only). This is safe to
--      run even if step 1 is blocked, independently of the rest of this
--      script.
--   5. This rollback does NOT attempt to restore the exact original
--      `generated_grocery_lists_status_check` / RLS policy internal OIDs —
--      only the equivalent constraint/policy definitions. Behavior is
--      restored; catalog identity is not guaranteed to be byte-identical.
-- ============================================================================

-- Reverse RLS hardening first — always safe, independent of data state.
-- ALTER POLICY cannot remove a WITH CHECK clause once set (only replace it),
-- so the original USING-only / person_id-only policies are restored via
-- drop + recreate.
DROP POLICY IF EXISTS "Users can insert own grocery_lists" ON public.generated_grocery_lists;
CREATE POLICY "Users can insert own grocery_lists" ON public.generated_grocery_lists
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own grocery_lists" ON public.generated_grocery_lists;
CREATE POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own grocery_items" ON public.grocery_items;
CREATE POLICY "Users can update own grocery_items" ON public.grocery_items
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

ALTER TABLE public.grocery_items
  DROP CONSTRAINT IF EXISTS grocery_items_source_type_check;

ALTER TABLE public.grocery_items
  DROP COLUMN IF EXISTS added_by_person_id,
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS source_detail_json;

DROP TRIGGER IF EXISTS grocery_list_contributors_updated_at ON public.grocery_list_contributors;
DROP POLICY IF EXISTS "Users can read own contributor rows or rows on owned lists" ON public.grocery_list_contributors;
DROP POLICY IF EXISTS "Owners can insert contributor rows on owned lists" ON public.grocery_list_contributors;
DROP POLICY IF EXISTS "Owners can update contributor rows on owned lists" ON public.grocery_list_contributors;
DROP POLICY IF EXISTS "Owners can delete contributor rows on owned lists" ON public.grocery_list_contributors;
DROP TABLE IF EXISTS public.grocery_list_contributors;

DROP INDEX IF EXISTS public.idx_grocery_lists_owner_default;
DROP INDEX IF EXISTS public.idx_grocery_lists_owner_updated;

ALTER TABLE public.generated_grocery_lists
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_status_check;
ALTER TABLE public.generated_grocery_lists
  ADD CONSTRAINT generated_grocery_lists_status_check
    CHECK (status IN ('draft', 'finalized', 'exported'));

ALTER TABLE public.generated_grocery_lists
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_owner_id_fkey,
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_owner_type_check,
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_owner_id_matches_person_id_v1_check;

ALTER TABLE public.generated_grocery_lists
  DROP COLUMN IF EXISTS is_default,
  DROP COLUMN IF EXISTS owner_type,
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS created_by_person_id,
  DROP COLUMN IF EXISTS archived_at;

-- Only safe once every remaining row has a non-NULL plan_id (see limitation
-- #1 above). Run this SELECT first to confirm zero rows before proceeding:
--   SELECT id, title FROM public.generated_grocery_lists WHERE plan_id IS NULL;
ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id SET NOT NULL;

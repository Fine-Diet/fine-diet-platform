-- ============================================================================
-- Rollback for scripts/sql/addGroceryListFoundation.sql (v2, corrected)
--
-- Safe to run only if no application code has started writing is_default,
-- plan_id-NULL persistent lists, or grocery_list_contributors rows that
-- would be lost. Re-adding NOT NULL on plan_id will FAIL if any list now
-- has a NULL plan_id (i.e. a persistent default/named list was created) —
-- resolve those rows (delete or backfill a plan_id) before running this
-- rollback.
-- ============================================================================

-- Restore original UPDATE policies (USING only, no WITH CHECK) on both
-- tables.
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
DROP TABLE IF EXISTS public.grocery_list_contributors;

DROP INDEX IF EXISTS public.idx_grocery_lists_person_default;
DROP INDEX IF EXISTS public.idx_grocery_lists_person_updated;

DROP POLICY IF EXISTS "Users can update own grocery_lists" ON public.generated_grocery_lists;
CREATE POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

ALTER TABLE public.generated_grocery_lists
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_status_check;
ALTER TABLE public.generated_grocery_lists
  ADD CONSTRAINT generated_grocery_lists_status_check
    CHECK (status IN ('draft', 'finalized', 'exported'));

ALTER TABLE public.generated_grocery_lists
  DROP COLUMN IF EXISTS is_default,
  DROP COLUMN IF EXISTS created_by_person_id,
  DROP COLUMN IF EXISTS archived_at;

-- Only safe once every remaining row has a non-NULL plan_id.
ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id SET NOT NULL;

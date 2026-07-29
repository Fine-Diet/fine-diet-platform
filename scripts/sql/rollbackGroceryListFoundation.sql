-- ============================================================================
-- Rollback for scripts/sql/addGroceryListFoundation.sql
--
-- Safe to run only if no application code has started writing is_default,
-- owner_id-only (plan_id NULL), or grocery_list_contributors rows that would
-- be lost. Re-adding NOT NULL on plan_id will FAIL if any list now has a
-- NULL plan_id (i.e. a persistent default/named list was created) — resolve
-- those rows (delete or backfill a plan_id) before running this rollback.
-- ============================================================================

ALTER TABLE public.grocery_items
  DROP CONSTRAINT IF EXISTS grocery_items_source_type_check;

ALTER TABLE public.grocery_items
  DROP COLUMN IF EXISTS added_by_person_id,
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS source_detail_json;

DROP TRIGGER IF EXISTS grocery_list_contributors_updated_at ON public.grocery_list_contributors;
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
  DROP CONSTRAINT IF EXISTS generated_grocery_lists_owner_type_check;

ALTER TABLE public.generated_grocery_lists
  DROP COLUMN IF EXISTS is_default,
  DROP COLUMN IF EXISTS owner_type,
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS created_by_person_id,
  DROP COLUMN IF EXISTS archived_at;

-- Only safe once every remaining row has a non-NULL plan_id.
ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id SET NOT NULL;

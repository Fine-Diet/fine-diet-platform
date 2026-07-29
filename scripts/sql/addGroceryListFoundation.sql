-- ============================================================================
-- Food Architecture Packet — Grocery List object foundation
--
-- Additive migration. Evolves `generated_grocery_lists` from a
-- plan/date-scope-only generation output into a first-class persistent
-- object (default running list + user-named lists), independent of any one
-- plan. Also adds item-level provenance and a contributor-membership table
-- so the schema is ready for future family collaboration without shipping
-- any collaboration UI yet.
--
-- Design rules:
--   - Additive only. No columns are dropped, no rows are deleted.
--   - `plan_id` becomes optional (a list may exist with no plan behind it).
--   - `owner_id` defaults from `person_id` for all existing rows, so every
--     existing list keeps working unchanged.
--   - `status` gains two new allowed values ('active', 'archived') alongside
--     the existing generation-workflow values ('draft', 'finalized',
--     'exported'); no existing row's status value changes.
--   - At most one *active* default list per owner, enforced via a partial
--     unique index (not a NOT NULL/UNIQUE column), so it never blocks
--     archived history.
--
-- Rollback: see scripts/sql/rollbackGroceryListFoundation.sql
--
-- Run this migration in Supabase SQL Editor:
--   1. Copy entire script
--   2. Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- generated_grocery_lists: persistent list identity
-- ----------------------------------------------------------------------------

ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.generated_grocery_lists
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill new identity columns from the existing person_id so every
-- pre-existing row is immediately valid under the new model.
UPDATE public.generated_grocery_lists
SET owner_id = person_id
WHERE owner_id IS NULL;

UPDATE public.generated_grocery_lists
SET created_by_person_id = person_id
WHERE created_by_person_id IS NULL;

ALTER TABLE public.generated_grocery_lists
  ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE public.generated_grocery_lists
  ADD CONSTRAINT generated_grocery_lists_owner_type_check
    CHECK (owner_type IN ('person')),
  ADD CONSTRAINT generated_grocery_lists_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.people(id) ON DELETE CASCADE;

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

CREATE POLICY "Users can read own contributor rows or rows on owned lists" ON public.grocery_list_contributors
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    OR grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
CREATE POLICY "Owners can insert contributor rows on owned lists" ON public.grocery_list_contributors
  FOR INSERT WITH CHECK (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
CREATE POLICY "Owners can update contributor rows on owned lists" ON public.grocery_list_contributors
  FOR UPDATE USING (
    grocery_list_id IN (
      SELECT id FROM public.generated_grocery_lists
      WHERE owner_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
    )
  );
CREATE POLICY "Owners can delete contributor rows on owned lists" ON public.grocery_list_contributors
  FOR DELETE USING (
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

ALTER TABLE public.grocery_items
  ADD CONSTRAINT grocery_items_source_type_check
    CHECK (source_type IN ('plan_derived', 'pantry_gap', 'recommendation', 'recipe', 'manual'));

-- Backfill: existing rows with no source_planned_meal_ids were added by hand,
-- not derived from a plan.
UPDATE public.grocery_items
SET source_type = 'manual'
WHERE source_planned_meal_ids IS NULL OR array_length(source_planned_meal_ids, 1) IS NULL;

UPDATE public.grocery_items
SET added_by_person_id = person_id
WHERE added_by_person_id IS NULL;

COMMENT ON COLUMN public.grocery_items.source_type IS
  'Generalized provenance. plan_derived items also carry source_planned_meal_ids for exact traceability.';

-- ============================================================================
-- Verification queries
-- ============================================================================

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'generated_grocery_lists'
--     AND column_name IN ('is_default','owner_type','owner_id','created_by_person_id','archived_at')
--   ORDER BY column_name;

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'grocery_items'
--     AND column_name IN ('added_by_person_id','source_type','source_id','source_detail_json')
--   ORDER BY column_name;

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'grocery_list_contributors';

-- SELECT owner_id, count(*) FROM public.generated_grocery_lists
--   WHERE is_default = true AND archived_at IS NULL
--   GROUP BY owner_id HAVING count(*) > 1; -- must return zero rows

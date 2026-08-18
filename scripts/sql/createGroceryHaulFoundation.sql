-- ============================================================================
-- Packet 11A — Canonical Haul schema & duplicate-safe identity
--
-- Additive, review-first. Establishes durable shopping-execution persistence
-- without implementing List → Haul creation, UI, checkout, retailer assignment,
-- or estimate-as-purchase-truth.
--
-- Canonical roles:
--   Grocery List = what I need/want to buy (store-agnostic, persistent)
--   Haul         = dated shopping-execution object with its own identity
--   Full Haul Estimate / GroceryHaulSummary = read-model cost support only
--
-- Managed `supabase/migrations` history in this repository is incomplete.
-- Follow the grocery-domain convention: idempotent scripts under scripts/sql,
-- not a partial migration chain. Do NOT apply to production or a shared remote
-- database unless separately authorized after review.
--
-- Idempotent / safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS guards.
--
-- Rollback: scripts/sql/rollbackGroceryHaulFoundation.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Supporting unique indexes for composite owner/list FKs.
-- id is already PK; (id, person_id) uniqueness is implied and added only so
-- Haul FKs can require matching list owner at the database level.
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_grocery_lists_id_person
  ON public.generated_grocery_lists (id, person_id);

-- ----------------------------------------------------------------------------
-- grocery_hauls — canonical dated shopping-execution object
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_hauls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  person_id UUID NOT NULL
    REFERENCES public.people(id) ON DELETE CASCADE,

  source_grocery_list_id UUID NOT NULL,

  shopping_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'closed', 'cancelled')),

  -- Caller-supplied idempotency token. Retries with the same person + token
  -- collide on idx_grocery_hauls_person_creation_token instead of inserting
  -- a second Haul. Database-enforced; not check-then-insert.
  creation_token UUID NOT NULL DEFAULT gen_random_uuid(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Owner must own the source list. ON DELETE NO ACTION (deferrable) blocks
  -- hard-deleting a list that still has Hauls, without CASCADE-erasing Haul
  -- history. Archive (archived_at) does not touch this FK.
  -- DEFERRABLE so person-level CASCADE of both hauls and lists in one
  -- transaction can commit after child rows are gone.
  CONSTRAINT grocery_hauls_list_owner_fk
    FOREIGN KEY (source_grocery_list_id, person_id)
    REFERENCES public.generated_grocery_lists (id, person_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_hauls_id_person
  ON public.grocery_hauls (id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_hauls_id_list
  ON public.grocery_hauls (id, source_grocery_list_id);

-- Exact retry / double-submit of the same creation_token.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_hauls_person_creation_token
  ON public.grocery_hauls (person_id, creation_token);

-- One open Haul per person + source list + shopping date.
-- Closed/cancelled history may repeat the same list+date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_hauls_open_list_date
  ON public.grocery_hauls (person_id, source_grocery_list_id, shopping_date)
  WHERE status IN ('planned', 'active');

CREATE INDEX IF NOT EXISTS idx_grocery_hauls_person_date
  ON public.grocery_hauls (person_id, shopping_date DESC);

CREATE INDEX IF NOT EXISTS idx_grocery_hauls_source_list
  ON public.grocery_hauls (source_grocery_list_id);

COMMENT ON TABLE public.grocery_hauls IS
  'Canonical dated shopping-execution object. Distinct from Grocery List need/want truth and from Full Haul Estimate read models. No retailer, price, checkout, receipt, or Pantry columns in v1.';

COMMENT ON COLUMN public.grocery_hauls.source_grocery_list_id IS
  'Source Grocery List this Haul was created from. List remains canonical need/want truth. Hard-delete of the list is rejected while Hauls exist; archive is the supported retirement path.';

COMMENT ON COLUMN public.grocery_hauls.shopping_date IS
  'User-confirmed shopping trip date. Not plan date_range_start/end and not an estimate timestamp.';

COMMENT ON COLUMN public.grocery_hauls.status IS
  'v1 lifecycle: planned | active | closed | cancelled. planned and active are open and unique per person+list+date.';

COMMENT ON COLUMN public.grocery_hauls.creation_token IS
  'Idempotency token unique per person. Callers retrying create must reuse the same token.';

-- ----------------------------------------------------------------------------
-- grocery_haul_items — frozen creation-time execution scope
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_haul_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  haul_id UUID NOT NULL,
  person_id UUID NOT NULL,
  source_grocery_list_id UUID NOT NULL,
  -- Historical pointer. Nullable so source-item hard delete SET NULL preserves
  -- frozen snapshots. Future create writer MUST revalidate that a supplied id
  -- belongs to this person and source list before insert; composite item FKs
  -- are not used because ON DELETE SET NULL on a composite key would also
  -- null person_id / source_grocery_list_id.
  grocery_item_id UUID
    REFERENCES public.grocery_items(id) ON DELETE SET NULL,

  name_snapshot TEXT NOT NULL,
  quantity_snapshot NUMERIC,
  unit_snapshot TEXT,
  food_object_id_snapshot UUID
    REFERENCES public.food_objects(id) ON DELETE SET NULL,
  source_status_snapshot TEXT NOT NULL
    CHECK (source_status_snapshot IN ('pending', 'have', 'bought', 'skipped')),

  source_type_snapshot TEXT
    CHECK (
      source_type_snapshot IS NULL
      OR source_type_snapshot IN (
        'manual',
        'planned_meal',
        'food_recommendation',
        'pantry_restocks',
        'recipe',
        'system'
      )
    ),
  source_id_snapshot UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_haul_items_quantity_nonnegative
    CHECK (quantity_snapshot IS NULL OR quantity_snapshot >= 0),

  CONSTRAINT grocery_haul_items_haul_item_unique
    UNIQUE (haul_id, grocery_item_id),

  -- Item rows die with the Haul. Deleting a Haul never deletes the Grocery List.
  CONSTRAINT grocery_haul_items_haul_owner_fk
    FOREIGN KEY (haul_id, person_id)
    REFERENCES public.grocery_hauls (id, person_id)
    ON DELETE CASCADE,

  CONSTRAINT grocery_haul_items_haul_list_fk
    FOREIGN KEY (haul_id, source_grocery_list_id)
    REFERENCES public.grocery_hauls (id, source_grocery_list_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_haul
  ON public.grocery_haul_items (haul_id);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_item
  ON public.grocery_haul_items (grocery_item_id);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_person
  ON public.grocery_haul_items (person_id);

COMMENT ON TABLE public.grocery_haul_items IS
  'Creation-time snapshot of selected grocery list items on a Haul. Snapshots are canonical historical scope. Later list edits or source-item hard deletes do not rewrite or erase Haul lines. Default future writer includes pending items only and must revalidate source-item owner/list membership before insert.';

COMMENT ON COLUMN public.grocery_haul_items.grocery_item_id IS
  'Optional historical pointer to grocery_items. ON DELETE SET NULL: removing a list item does not delete or invalidate the Haul line. Snapshots remain canonical. Create writer must revalidate owner and source-list membership when this id is supplied.';

COMMENT ON COLUMN public.grocery_haul_items.source_status_snapshot IS
  'grocery_items.status at Haul creation. Future v1 writer should copy pending rows only.';

COMMENT ON COLUMN public.grocery_haul_items.food_object_id_snapshot IS
  'Optional resolved food identity at creation. SET NULL if the food object is later removed; name_snapshot remains.';

-- ----------------------------------------------------------------------------
-- updated_at
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS grocery_hauls_updated_at ON public.grocery_hauls;
CREATE TRIGGER grocery_hauls_updated_at BEFORE UPDATE ON public.grocery_hauls
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — owner-only via person_id, WITH CHECK on writes
-- ----------------------------------------------------------------------------

ALTER TABLE public.grocery_hauls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_haul_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_hauls"
  ON public.grocery_hauls;
DROP POLICY IF EXISTS "Users can insert own grocery_hauls"
  ON public.grocery_hauls;
DROP POLICY IF EXISTS "Users can update own grocery_hauls"
  ON public.grocery_hauls;
DROP POLICY IF EXISTS "Users can delete own grocery_hauls"
  ON public.grocery_hauls;

CREATE POLICY "Users can read own grocery_hauls"
  ON public.grocery_hauls
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_hauls"
  ON public.grocery_hauls
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_hauls"
  ON public.grocery_hauls
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_hauls"
  ON public.grocery_hauls
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read own grocery_haul_items"
  ON public.grocery_haul_items;
DROP POLICY IF EXISTS "Users can insert own grocery_haul_items"
  ON public.grocery_haul_items;
DROP POLICY IF EXISTS "Users can update own grocery_haul_items"
  ON public.grocery_haul_items;
DROP POLICY IF EXISTS "Users can delete own grocery_haul_items"
  ON public.grocery_haul_items;

CREATE POLICY "Users can read own grocery_haul_items"
  ON public.grocery_haul_items
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_haul_items"
  ON public.grocery_haul_items
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_haul_items"
  ON public.grocery_haul_items
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_haul_items"
  ON public.grocery_haul_items
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- Verification queries (run after apply; expect empty mismatch results)
-- ============================================================================

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('grocery_hauls', 'grocery_haul_items');

-- SELECT indexname FROM pg_indexes
--   WHERE tablename = 'grocery_hauls'
--     AND indexname IN (
--       'idx_grocery_hauls_person_creation_token',
--       'idx_grocery_hauls_open_list_date'
--     );

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'grocery_hauls'
--     AND column_name IN ('retailer', 'store_id', 'estimated_total', 'checkout_id');
-- -- must return zero rows

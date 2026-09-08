-- ============================================================================
-- Signed-In App Upgrade Packet 2 — Food persistence/schema foundation
--
-- Additive upgrade for:
--   1. Multi-List Haul membership with item-level source List provenance.
--   2. Pantry acquisition lots without changing pantry_on_hand_items aggregate
--      identity, quantity, unit, or legacy metadata behavior.
--
-- Repository convention: reviewed, idempotent SQL under scripts/sql because
-- the managed supabase/migrations history in this repository is incomplete.
-- Do not apply to production or a shared remote database from a feature branch.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_grocery_lists_id_person
  ON public.generated_grocery_lists (id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_on_hand_items_id_person
  ON public.pantry_on_hand_items (id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_items_id_haul_person
  ON public.grocery_haul_items (id, haul_id, person_id);

-- ----------------------------------------------------------------------------
-- Haul source-List membership
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_haul_source_lists (
  haul_id UUID NOT NULL,
  grocery_list_id UUID NOT NULL,
  person_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_haul_source_lists_pkey
    PRIMARY KEY (haul_id, grocery_list_id),

  CONSTRAINT grocery_haul_source_lists_haul_owner_fk
    FOREIGN KEY (haul_id, person_id)
    REFERENCES public.grocery_hauls (id, person_id)
    ON DELETE CASCADE,

  -- Preserve source identity/history: archive is allowed; hard-delete is
  -- blocked while a Haul membership still references the List.
  CONSTRAINT grocery_haul_source_lists_list_owner_fk
    FOREIGN KEY (grocery_list_id, person_id)
    REFERENCES public.generated_grocery_lists (id, person_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,

  CONSTRAINT grocery_haul_source_lists_haul_list_person_unique
    UNIQUE (haul_id, grocery_list_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_source_lists_person_haul
  ON public.grocery_haul_source_lists (person_id, haul_id);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_source_lists_person_list
  ON public.grocery_haul_source_lists (person_id, grocery_list_id);

-- Backfill every legacy one-List Haul exactly once. Re-running is a no-op.
INSERT INTO public.grocery_haul_source_lists (
  haul_id,
  grocery_list_id,
  person_id,
  created_at
)
SELECT
  gh.id,
  gh.source_grocery_list_id,
  gh.person_id,
  gh.created_at
FROM public.grocery_hauls gh
ON CONFLICT (haul_id, grocery_list_id) DO NOTHING;

-- Flush the backfill's deferred owner-FK checks before the membership table is
-- referenced by the replacement item FK in this same migration transaction.
SET CONSTRAINTS ALL IMMEDIATE;

-- Replace the legacy "every item equals the Haul primary List" constraint with
-- "every item source List is a member of this Haul for the same owner."
ALTER TABLE public.grocery_haul_items
  DROP CONSTRAINT IF EXISTS grocery_haul_items_haul_list_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_source_membership_fk'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_source_membership_fk
      FOREIGN KEY (haul_id, source_grocery_list_id, person_id)
      REFERENCES public.grocery_haul_source_lists (
        haul_id,
        grocery_list_id,
        person_id
      )
      ON DELETE NO ACTION
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

COMMENT ON TABLE public.grocery_haul_source_lists IS
  'Complete set of persistent Grocery Lists snapshotted into a Haul. grocery_hauls.source_grocery_list_id remains the legacy/primary source only.';

COMMENT ON COLUMN public.grocery_hauls.source_grocery_list_id IS
  'Legacy/primary source List retained for backward compatibility. The complete membership set is grocery_haul_source_lists.';

COMMENT ON COLUMN public.grocery_haul_items.source_grocery_list_id IS
  'Frozen item-level source List provenance. Must be a same-owner member of the Haul.';

ALTER TABLE public.grocery_haul_source_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists;
DROP POLICY IF EXISTS "Users can insert own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists;
DROP POLICY IF EXISTS "Users can update own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists;
DROP POLICY IF EXISTS "Users can delete own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists;

CREATE POLICY "Users can read own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_haul_source_lists"
  ON public.grocery_haul_source_lists
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Pantry acquisition lots
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pantry_acquisition_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pantry_item_id UUID NOT NULL,
  person_id UUID NOT NULL
    REFERENCES public.people(id) ON DELETE CASCADE,

  acquired_on DATE NOT NULL,
  expires_on DATE,
  expected_shelf_life_days INTEGER,

  quantity_acquired NUMERIC NOT NULL,
  quantity_remaining NUMERIC NOT NULL,
  unit TEXT,

  product_title TEXT,
  brand_name TEXT,
  package_size NUMERIC,
  package_unit TEXT,
  package_count NUMERIC,
  retailer TEXT,
  price_amount NUMERIC,
  currency TEXT,

  source_haul_id UUID,
  source_haul_item_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pantry_acquisition_lots_quantity_acquired_positive
    CHECK (quantity_acquired > 0),
  CONSTRAINT pantry_acquisition_lots_quantity_remaining_range
    CHECK (
      quantity_remaining >= 0
      AND quantity_remaining <= quantity_acquired
    ),
  CONSTRAINT pantry_acquisition_lots_shelf_life_positive
    CHECK (
      expected_shelf_life_days IS NULL
      OR expected_shelf_life_days > 0
    ),
  CONSTRAINT pantry_acquisition_lots_package_size_positive
    CHECK (package_size IS NULL OR package_size > 0),
  CONSTRAINT pantry_acquisition_lots_package_count_positive
    CHECK (package_count IS NULL OR package_count > 0),
  CONSTRAINT pantry_acquisition_lots_price_nonnegative
    CHECK (price_amount IS NULL OR price_amount >= 0),
  CONSTRAINT pantry_acquisition_lots_currency_format
    CHECK (
      currency IS NULL
      OR currency ~ '^[A-Z]{3}$'
    ),
  CONSTRAINT pantry_acquisition_lots_source_item_requires_haul
    CHECK (source_haul_item_id IS NULL OR source_haul_id IS NOT NULL),

  -- A Pantry aggregate cannot be hard-deleted while its acquisition history
  -- exists. Person deletion remains safe because both rows are person-owned.
  CONSTRAINT pantry_acquisition_lots_pantry_owner_fk
    FOREIGN KEY (pantry_item_id, person_id)
    REFERENCES public.pantry_on_hand_items (id, person_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,

  -- Historical provenance deliberately blocks hard-deleting a referenced Haul
  -- or Haul item. Closing/cancelling a Haul does not affect lots.
  CONSTRAINT pantry_acquisition_lots_haul_owner_fk
    FOREIGN KEY (source_haul_id, person_id)
    REFERENCES public.grocery_hauls (id, person_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,

  CONSTRAINT pantry_acquisition_lots_haul_item_owner_fk
    FOREIGN KEY (source_haul_item_id, source_haul_id, person_id)
    REFERENCES public.grocery_haul_items (id, haul_id, person_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_pantry_acquisition_lots_person_acquired
  ON public.pantry_acquisition_lots (person_id, acquired_on DESC);

CREATE INDEX IF NOT EXISTS idx_pantry_acquisition_lots_pantry_acquired
  ON public.pantry_acquisition_lots (pantry_item_id, acquired_on DESC);

CREATE INDEX IF NOT EXISTS idx_pantry_acquisition_lots_source_haul
  ON public.pantry_acquisition_lots (source_haul_id)
  WHERE source_haul_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pantry_acquisition_lots_source_haul_item
  ON public.pantry_acquisition_lots (source_haul_item_id)
  WHERE source_haul_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS pantry_acquisition_lots_updated_at
  ON public.pantry_acquisition_lots;
CREATE TRIGGER pantry_acquisition_lots_updated_at
  BEFORE UPDATE ON public.pantry_acquisition_lots
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

COMMENT ON TABLE public.pantry_acquisition_lots IS
  'Acquisition-level Pantry truth. Multiple lots may reference one canonical pantry_on_hand_items aggregate without changing legacy aggregate reads/writes.';

COMMENT ON COLUMN public.pantry_acquisition_lots.quantity_remaining IS
  'Remaining amount for this acquisition lot; pantry_on_hand_items.quantity remains the backward-compatible aggregate quantity.';

ALTER TABLE public.pantry_acquisition_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots;
DROP POLICY IF EXISTS "Users can insert own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots;
DROP POLICY IF EXISTS "Users can update own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots;
DROP POLICY IF EXISTS "Users can delete own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots;

CREATE POLICY "Users can read own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own pantry_acquisition_lots"
  ON public.pantry_acquisition_lots
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Atomic one-or-more List -> Haul creation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_grocery_haul_from_lists(
  p_person_id UUID,
  p_source_grocery_list_ids UUID[],
  p_shopping_date DATE,
  p_creation_token UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_list_ids UUID[];
  v_primary_list_id UUID;
  v_haul public.grocery_hauls%ROWTYPE;
  v_existing_members UUID[];
  v_requested_members UUID[];
  v_constraint TEXT;
  v_created BOOLEAN := FALSE;
  v_item_count INTEGER := 0;
BEGIN
  SELECT array_agg(source_id ORDER BY first_ordinality)
    INTO v_source_list_ids
  FROM (
    SELECT source_id, min(ordinality) AS first_ordinality
    FROM unnest(p_source_grocery_list_ids) WITH ORDINALITY AS source(source_id, ordinality)
    WHERE source_id IS NOT NULL
    GROUP BY source_id
  ) normalized;

  IF p_person_id IS NULL
     OR COALESCE(cardinality(v_source_list_ids), 0) = 0
     OR p_shopping_date IS NULL
     OR p_creation_token IS NULL THEN
    RAISE EXCEPTION 'HAUL_CREATE_INVALID_ARGS';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_person_id
      AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CREATE_FORBIDDEN';
  END IF;

  IF (
    SELECT count(*)
    FROM public.generated_grocery_lists
    WHERE id = ANY(v_source_list_ids)
      AND person_id = p_person_id
      AND archived_at IS NULL
  ) <> cardinality(v_source_list_ids) THEN
    RAISE EXCEPTION 'HAUL_CREATE_LIST_NOT_FOUND';
  END IF;

  v_primary_list_id := v_source_list_ids[1];

  PERFORM pg_advisory_xact_lock(
    hashtext('create_grocery_haul_from_lists'),
    hashtext(p_person_id::text || ':' || array_to_string(v_source_list_ids, ','))
  );

  BEGIN
    INSERT INTO public.grocery_hauls (
      person_id,
      source_grocery_list_id,
      shopping_date,
      status,
      creation_token
    ) VALUES (
      p_person_id,
      v_primary_list_id,
      p_shopping_date,
      'planned',
      p_creation_token
    )
    RETURNING * INTO v_haul;
    v_created := TRUE;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'idx_grocery_hauls_person_creation_token'
         OR SQLERRM ILIKE '%idx_grocery_hauls_person_creation_token%' THEN
        SELECT *
          INTO v_haul
        FROM public.grocery_hauls
        WHERE person_id = p_person_id
          AND creation_token = p_creation_token;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'HAUL_CREATE_TOKEN_RACE';
        END IF;

        SELECT array_agg(grocery_list_id ORDER BY grocery_list_id)
          INTO v_existing_members
        FROM public.grocery_haul_source_lists
        WHERE haul_id = v_haul.id
          AND person_id = p_person_id;

        SELECT array_agg(source_id ORDER BY source_id)
          INTO v_requested_members
        FROM unnest(v_source_list_ids) AS source(source_id);

        IF v_haul.source_grocery_list_id IS DISTINCT FROM v_primary_list_id
           OR v_haul.shopping_date IS DISTINCT FROM p_shopping_date
           OR v_existing_members IS DISTINCT FROM v_requested_members THEN
          RAISE EXCEPTION 'HAUL_CREATE_TOKEN_MISMATCH';
        END IF;
        v_created := FALSE;
      ELSIF v_constraint = 'idx_grocery_hauls_open_list_date'
            OR SQLERRM ILIKE '%idx_grocery_hauls_open_list_date%' THEN
        RAISE EXCEPTION 'HAUL_CREATE_OPEN_EXISTS';
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_created THEN
    SELECT count(*)::INTEGER
      INTO v_item_count
    FROM public.grocery_haul_items
    WHERE haul_id = v_haul.id
      AND person_id = p_person_id;

    RETURN jsonb_build_object(
      'haul_id', v_haul.id,
      'person_id', v_haul.person_id,
      'source_grocery_list_id', v_haul.source_grocery_list_id,
      'source_grocery_list_ids', to_jsonb(v_source_list_ids),
      'shopping_date', v_haul.shopping_date,
      'status', v_haul.status,
      'creation_token', v_haul.creation_token,
      'item_count', v_item_count,
      'outcome', 'reused'
    );
  END IF;

  INSERT INTO public.grocery_haul_source_lists (
    haul_id,
    grocery_list_id,
    person_id
  )
  SELECT v_haul.id, source_id, p_person_id
  FROM unnest(v_source_list_ids) AS source(source_id);

  INSERT INTO public.grocery_haul_items (
    haul_id,
    person_id,
    source_grocery_list_id,
    grocery_item_id,
    name_snapshot,
    quantity_snapshot,
    unit_snapshot,
    food_object_id_snapshot,
    source_status_snapshot,
    source_type_snapshot,
    source_id_snapshot
  )
  SELECT
    v_haul.id,
    p_person_id,
    gi.grocery_list_id,
    gi.id,
    gi.name,
    gi.quantity,
    gi.unit,
    gi.food_object_id,
    gi.status,
    gi.source_type,
    gi.source_id
  FROM public.grocery_items gi
  WHERE gi.grocery_list_id = ANY(v_source_list_ids)
    AND gi.person_id = p_person_id
    AND gi.status = 'pending'
  ORDER BY array_position(v_source_list_ids, gi.grocery_list_id), gi.created_at, gi.id;

  GET DIAGNOSTICS v_item_count = ROW_COUNT;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'HAUL_CREATE_NO_PENDING_ITEMS';
  END IF;

  RETURN jsonb_build_object(
    'haul_id', v_haul.id,
    'person_id', v_haul.person_id,
    'source_grocery_list_id', v_haul.source_grocery_list_id,
    'source_grocery_list_ids', to_jsonb(v_source_list_ids),
    'shopping_date', v_haul.shopping_date,
    'status', v_haul.status,
    'creation_token', v_haul.creation_token,
    'item_count', v_item_count,
    'outcome', 'created'
  );
END;
$$;

-- Preserve the existing one-List RPC signature and behavior for all callers.
CREATE OR REPLACE FUNCTION public.create_grocery_haul_from_list(
  p_person_id UUID,
  p_source_grocery_list_id UUID,
  p_shopping_date DATE,
  p_creation_token UUID
) RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.create_grocery_haul_from_lists(
    p_person_id,
    ARRAY[p_source_grocery_list_id],
    p_shopping_date,
    p_creation_token
  );
$$;

REVOKE ALL ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) TO service_role;

COMMENT ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) IS
  'Atomically creates a Haul from one or more same-owner active Lists, normalizes duplicate IDs, records memberships, and freezes pending item provenance without mutating source Lists or pricing data.';

COMMENT ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) IS
  'Backward-compatible one-List wrapper for create_grocery_haul_from_lists.';

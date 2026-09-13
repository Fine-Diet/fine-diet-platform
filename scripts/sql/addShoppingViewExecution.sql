-- ============================================================================
-- Signed-In App Upgrade Packet 9 — Shopping View execution persistence
--
-- Repository-only, reviewed/idempotent SQL. Do not apply to production or a
-- shared remote without a separate controlled deployment authorization.
--
-- Three truths remain separate:
--   grocery_haul_items quantity_snapshot = source demand
--   grocery_haul_items final/prepared fields = prepared purchase instruction
--   grocery_haul_execution_items acquired fields = acquisition outcome
-- ============================================================================

ALTER TABLE public.grocery_hauls
  ADD COLUMN IF NOT EXISTS shopping_started_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_items_id_haul_person
  ON public.grocery_haul_items (id, haul_id, person_id);

CREATE TABLE IF NOT EXISTS public.grocery_haul_execution_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,
  haul_id UUID NOT NULL,
  haul_item_id UUID NOT NULL,
  sort_ordinal INTEGER NOT NULL CHECK (sort_ordinal > 0),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'in_basket', 'skipped')),

  -- Frozen source-demand display provenance.
  source_grocery_list_id UUID NOT NULL,
  source_name_snapshot TEXT NOT NULL,
  source_quantity_snapshot NUMERIC,
  source_unit_snapshot TEXT,

  -- Frozen prepared instruction copied at planned -> active.
  prepared_quantity NUMERIC NOT NULL CHECK (prepared_quantity > 0),
  prepared_selected_food_object_id UUID,
  prepared_product_title TEXT,
  prepared_brand_name TEXT,
  prepared_purchase_unit TEXT,
  prepared_package_size NUMERIC,
  prepared_package_unit TEXT,
  prepared_package_count NUMERIC,
  prepared_retailer TEXT,
  prepared_store_location TEXT,
  prepared_postal_code TEXT,
  prepared_price_amount NUMERIC,
  prepared_price_currency TEXT,
  prepared_price_source TEXT,
  prepared_source_purchasing_choice_id UUID,
  prepared_source_price_observation_id UUID,

  -- Mutable acquisition outcome. Differences from prepared_* are substitution
  -- truth; no redundant is_substitution flag is persisted.
  acquired_quantity NUMERIC,
  acquired_food_object_id UUID,
  acquired_product_title TEXT,
  acquired_brand_name TEXT,
  acquired_purchase_unit TEXT,
  acquired_package_size NUMERIC,
  acquired_package_unit TEXT,
  acquired_package_count NUMERIC,
  acquired_retailer TEXT,
  acquired_store_location TEXT,
  acquired_postal_code TEXT,
  acquired_price_amount NUMERIC,
  acquired_price_currency TEXT,

  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  basketed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  acquisition_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_haul_execution_items_haul_item_unique
    UNIQUE (haul_item_id),
  CONSTRAINT grocery_haul_execution_items_haul_ordinal_unique
    UNIQUE (haul_id, sort_ordinal),
  CONSTRAINT grocery_haul_execution_items_haul_owner_fk
    FOREIGN KEY (haul_id, person_id)
    REFERENCES public.grocery_hauls (id, person_id)
    ON DELETE CASCADE,
  CONSTRAINT grocery_haul_execution_items_source_item_owner_fk
    FOREIGN KEY (haul_item_id, haul_id, person_id)
    REFERENCES public.grocery_haul_items (id, haul_id, person_id)
    ON DELETE CASCADE,
  CONSTRAINT grocery_haul_execution_items_acquired_quantity_nonnegative
    CHECK (acquired_quantity IS NULL OR acquired_quantity >= 0),
  CONSTRAINT grocery_haul_execution_items_acquired_price_nonnegative
    CHECK (acquired_price_amount IS NULL OR acquired_price_amount >= 0),
  CONSTRAINT grocery_haul_execution_items_acquired_currency_format
    CHECK (
      acquired_price_currency IS NULL
      OR acquired_price_currency ~ '^[A-Z]{3}$'
    ),
  CONSTRAINT grocery_haul_execution_items_prepared_price_state
    CHECK (
      (prepared_price_amount IS NULL AND prepared_price_currency IS NULL)
      OR (
        prepared_price_amount IS NOT NULL
        AND prepared_price_amount >= 0
        AND prepared_price_currency ~ '^[A-Z]{3}$'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_execution_items_person_haul
  ON public.grocery_haul_execution_items (person_id, haul_id, sort_ordinal);
CREATE INDEX IF NOT EXISTS idx_grocery_haul_execution_items_person_haul_state
  ON public.grocery_haul_execution_items (person_id, haul_id, state);

COMMENT ON TABLE public.grocery_haul_execution_items IS
  'One immutable activation snapshot plus mutable acquisition outcome per included Haul item. Never source List or prepared Haul truth.';
COMMENT ON COLUMN public.grocery_haul_execution_items.prepared_quantity IS
  'Immutable activation-time copy of grocery_haul_items.final_quantity.';
COMMENT ON COLUMN public.grocery_haul_execution_items.source_quantity_snapshot IS
  'Immutable display copy of source demand; distinct from prepared_quantity and acquired_quantity.';
COMMENT ON COLUMN public.grocery_haul_execution_items.acquired_food_object_id IS
  'Acquisition outcome identity. Deliberately no FK so later catalog deletion cannot rewrite shopping history.';

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_execution_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.haul_id IS DISTINCT FROM OLD.haul_id
     OR NEW.haul_item_id IS DISTINCT FROM OLD.haul_item_id
     OR NEW.sort_ordinal IS DISTINCT FROM OLD.sort_ordinal
     OR NEW.source_grocery_list_id IS DISTINCT FROM OLD.source_grocery_list_id
     OR NEW.source_name_snapshot IS DISTINCT FROM OLD.source_name_snapshot
     OR NEW.source_quantity_snapshot IS DISTINCT FROM OLD.source_quantity_snapshot
     OR NEW.source_unit_snapshot IS DISTINCT FROM OLD.source_unit_snapshot
     OR NEW.prepared_quantity IS DISTINCT FROM OLD.prepared_quantity
     OR NEW.prepared_selected_food_object_id IS DISTINCT FROM OLD.prepared_selected_food_object_id
     OR NEW.prepared_product_title IS DISTINCT FROM OLD.prepared_product_title
     OR NEW.prepared_brand_name IS DISTINCT FROM OLD.prepared_brand_name
     OR NEW.prepared_purchase_unit IS DISTINCT FROM OLD.prepared_purchase_unit
     OR NEW.prepared_package_size IS DISTINCT FROM OLD.prepared_package_size
     OR NEW.prepared_package_unit IS DISTINCT FROM OLD.prepared_package_unit
     OR NEW.prepared_package_count IS DISTINCT FROM OLD.prepared_package_count
     OR NEW.prepared_retailer IS DISTINCT FROM OLD.prepared_retailer
     OR NEW.prepared_store_location IS DISTINCT FROM OLD.prepared_store_location
     OR NEW.prepared_postal_code IS DISTINCT FROM OLD.prepared_postal_code
     OR NEW.prepared_price_amount IS DISTINCT FROM OLD.prepared_price_amount
     OR NEW.prepared_price_currency IS DISTINCT FROM OLD.prepared_price_currency
     OR NEW.prepared_price_source IS DISTINCT FROM OLD.prepared_price_source
     OR NEW.prepared_source_purchasing_choice_id IS DISTINCT FROM OLD.prepared_source_purchasing_choice_id
     OR NEW.prepared_source_price_observation_id IS DISTINCT FROM OLD.prepared_source_price_observation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_SNAPSHOT_IMMUTABLE';
  END IF;

  SELECT status INTO v_status
  FROM public.grocery_hauls
  WHERE id = OLD.haul_id AND person_id = OLD.person_id
  FOR SHARE;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_NOT_ACTIVE';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state
     AND NOT (
       (OLD.state = 'pending' AND NEW.state IN ('in_basket', 'skipped'))
       OR (NEW.state = 'pending' AND OLD.state IN ('in_basket', 'skipped'))
     ) THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_TRANSITION';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.state_changed_at := now();
    IF NEW.state = 'in_basket' THEN NEW.basketed_at := now(); END IF;
    IF NEW.state = 'skipped' THEN NEW.skipped_at := now(); END IF;
  END IF;

  IF NEW.acquired_quantity IS DISTINCT FROM OLD.acquired_quantity
     OR NEW.acquired_food_object_id IS DISTINCT FROM OLD.acquired_food_object_id
     OR NEW.acquired_product_title IS DISTINCT FROM OLD.acquired_product_title
     OR NEW.acquired_brand_name IS DISTINCT FROM OLD.acquired_brand_name
     OR NEW.acquired_purchase_unit IS DISTINCT FROM OLD.acquired_purchase_unit
     OR NEW.acquired_package_size IS DISTINCT FROM OLD.acquired_package_size
     OR NEW.acquired_package_unit IS DISTINCT FROM OLD.acquired_package_unit
     OR NEW.acquired_package_count IS DISTINCT FROM OLD.acquired_package_count
     OR NEW.acquired_retailer IS DISTINCT FROM OLD.acquired_retailer
     OR NEW.acquired_store_location IS DISTINCT FROM OLD.acquired_store_location
     OR NEW.acquired_postal_code IS DISTINCT FROM OLD.acquired_postal_code
     OR NEW.acquired_price_amount IS DISTINCT FROM OLD.acquired_price_amount
     OR NEW.acquired_price_currency IS DISTINCT FROM OLD.acquired_price_currency THEN
    NEW.acquisition_updated_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_haul_execution_items_guard
  ON public.grocery_haul_execution_items;
CREATE TRIGGER grocery_haul_execution_items_guard
  BEFORE UPDATE ON public.grocery_haul_execution_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_execution_item();

ALTER TABLE public.grocery_haul_execution_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own grocery_haul_execution_items"
  ON public.grocery_haul_execution_items;
CREATE POLICY "Users can read own grocery_haul_execution_items"
  ON public.grocery_haul_execution_items
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.get_grocery_haul_execution_readiness(
  p_person_id UUID,
  p_haul_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_count INTEGER;
  v_warnings JSONB;
BEGIN
  IF p_person_id IS NULL OR p_haul_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_FORBIDDEN';
  END IF;

  SELECT status INTO v_status
  FROM public.grocery_hauls
  WHERE id = p_haul_id AND person_id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAUL_EXECUTION_NOT_FOUND'; END IF;

  SELECT count(*)::INTEGER INTO v_count
  FROM public.grocery_haul_items
  WHERE haul_id = p_haul_id
    AND person_id = p_person_id
    AND final_quantity > 0;

  SELECT COALESCE(jsonb_agg(finding ORDER BY item_ordinal, code), '[]'::jsonb)
  INTO v_warnings
  FROM (
    SELECT row_number() OVER (ORDER BY item.created_at, item.id) AS item_ordinal,
      warning.code,
      jsonb_build_object(
        'code', warning.code,
        'severity', 'warning',
        'haul_item_id', item.id,
        'message', warning.message
      ) AS finding
    FROM public.grocery_haul_items item
    CROSS JOIN LATERAL (
      SELECT 'missing_purchasing_product'::TEXT AS code,
        'Purchasing product is not selected.'::TEXT AS message
      WHERE item.selected_food_object_id IS NULL
        AND NULLIF(btrim(item.product_title), '') IS NULL
      UNION ALL
      SELECT 'missing_store_location',
        'Store or location context is missing.'
      WHERE NULLIF(btrim(item.retailer), '') IS NULL
        AND NULLIF(btrim(item.store_location), '') IS NULL
        AND NULLIF(btrim(item.postal_code), '') IS NULL
      UNION ALL
      SELECT 'missing_price', 'Price is missing.'
      WHERE item.price_amount IS NULL
    ) warning
    WHERE item.haul_id = p_haul_id
      AND item.person_id = p_person_id
      AND item.final_quantity > 0
  ) warnings;

  RETURN jsonb_build_object(
    'haul_id', p_haul_id,
    'status', v_status,
    'can_start', v_status IN ('planned', 'active') AND v_count > 0,
    'executable_item_count', v_count,
    'blockers', CASE
      WHEN v_count = 0 THEN jsonb_build_array(jsonb_build_object(
        'code', 'zero_executable_items',
        'severity', 'blocker',
        'message', 'At least one item must have final_quantity greater than zero.'
      ))
      ELSE '[]'::jsonb
    END,
    'warnings', v_warnings,
    'deferred_findings', jsonb_build_array(
      jsonb_build_object(
        'code', 'source_changes_not_evaluated',
        'evaluation', 'not_evaluated'
      ),
      jsonb_build_object(
        'code', 'duplicate_conflicts_not_evaluated',
        'evaluation', 'not_evaluated'
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_grocery_haul_execution(
  p_person_id UUID,
  p_haul_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul public.grocery_hauls%ROWTYPE;
  v_executable_count INTEGER;
  v_seeded_count INTEGER;
BEGIN
  IF p_person_id IS NULL OR p_haul_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_FORBIDDEN';
  END IF;

  SELECT * INTO v_haul
  FROM public.grocery_hauls
  WHERE id = p_haul_id AND person_id = p_person_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAUL_EXECUTION_NOT_FOUND'; END IF;

  IF v_haul.status = 'active' THEN
    SELECT count(*)::INTEGER INTO v_seeded_count
    FROM public.grocery_haul_execution_items
    WHERE haul_id = p_haul_id AND person_id = p_person_id;
    IF v_seeded_count = 0 THEN
      RAISE EXCEPTION 'HAUL_EXECUTION_INCOMPLETE';
    END IF;
    RETURN jsonb_build_object(
      'haul_id', p_haul_id,
      'status', 'active',
      'shopping_started_at', v_haul.shopping_started_at,
      'item_count', v_seeded_count,
      'outcome', 'already_active'
    );
  END IF;

  IF v_haul.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_HISTORICAL';
  END IF;
  IF v_haul.status IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_STATUS';
  END IF;

  SELECT count(*)::INTEGER INTO v_executable_count
  FROM public.grocery_haul_items
  WHERE haul_id = p_haul_id
    AND person_id = p_person_id
    AND final_quantity > 0;
  IF v_executable_count = 0 THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_ZERO_ITEMS';
  END IF;

  INSERT INTO public.grocery_haul_execution_items (
    person_id, haul_id, haul_item_id, sort_ordinal, state,
    source_grocery_list_id, source_name_snapshot,
    source_quantity_snapshot, source_unit_snapshot,
    prepared_quantity, prepared_selected_food_object_id,
    prepared_product_title, prepared_brand_name, prepared_purchase_unit,
    prepared_package_size, prepared_package_unit, prepared_package_count,
    prepared_retailer, prepared_store_location, prepared_postal_code,
    prepared_price_amount, prepared_price_currency, prepared_price_source,
    prepared_source_purchasing_choice_id, prepared_source_price_observation_id,
    acquired_quantity, acquired_food_object_id, acquired_product_title,
    acquired_brand_name, acquired_purchase_unit, acquired_package_size,
    acquired_package_unit, acquired_package_count, acquired_retailer,
    acquired_store_location, acquired_postal_code, acquired_price_amount,
    acquired_price_currency
  )
  SELECT
    item.person_id, item.haul_id, item.id,
    row_number() OVER (ORDER BY item.created_at, item.id)::INTEGER,
    'pending',
    item.source_grocery_list_id, item.name_snapshot,
    item.quantity_snapshot, item.unit_snapshot,
    item.final_quantity, item.selected_food_object_id,
    item.product_title, item.brand_name, item.purchase_unit,
    item.package_size, item.package_unit, item.package_count,
    item.retailer, item.store_location, item.postal_code,
    item.price_amount, item.price_currency, item.price_source,
    item.source_purchasing_choice_id, item.source_price_observation_id,
    item.final_quantity, item.selected_food_object_id, item.product_title,
    item.brand_name, item.purchase_unit, item.package_size,
    item.package_unit, item.package_count, item.retailer,
    item.store_location, item.postal_code, item.price_amount,
    item.price_currency
  FROM public.grocery_haul_items item
  WHERE item.haul_id = p_haul_id
    AND item.person_id = p_person_id
    AND item.final_quantity > 0
  ORDER BY item.created_at, item.id
  ON CONFLICT (haul_item_id) DO NOTHING;

  SELECT count(*)::INTEGER INTO v_seeded_count
  FROM public.grocery_haul_execution_items
  WHERE haul_id = p_haul_id AND person_id = p_person_id;
  IF v_seeded_count <> v_executable_count THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_SEED_MISMATCH';
  END IF;

  UPDATE public.grocery_hauls
  SET status = 'active',
      shopping_started_at = COALESCE(shopping_started_at, now())
  WHERE id = p_haul_id AND person_id = p_person_id
  RETURNING * INTO v_haul;

  RETURN jsonb_build_object(
    'haul_id', p_haul_id,
    'status', 'active',
    'shopping_started_at', v_haul.shopping_started_at,
    'item_count', v_seeded_count,
    'outcome', 'started'
  );
END;
$$;

REVOKE ALL PRIVILEGES ON public.grocery_haul_execution_items
  FROM anon, authenticated;
GRANT SELECT ON public.grocery_haul_execution_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.grocery_haul_execution_items TO service_role;

REVOKE ALL ON FUNCTION public.get_grocery_haul_execution_readiness(UUID, UUID)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_grocery_haul_execution_readiness(UUID, UUID)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_grocery_haul_execution_readiness(UUID, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.start_grocery_haul_execution(UUID, UUID)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_grocery_haul_execution(UUID, UUID)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_grocery_haul_execution(UUID, UUID)
  TO service_role;

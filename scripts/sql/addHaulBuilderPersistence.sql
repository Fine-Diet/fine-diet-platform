-- ============================================================================
-- Signed-In App Upgrade Packet 6 — Haul preparation persistence
--
-- Repository-only, reviewed/idempotent SQL. Do not apply to production or a
-- shared remote without a separate deployment authorization.
--
-- quantity_snapshot remains immutable source-List demand provenance.
-- final_quantity is the independent mutable Haul purchase instruction.
-- ============================================================================

ALTER TABLE public.grocery_hauls
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS budget_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.grocery_hauls
SET currency = 'USD'
WHERE currency IS NULL;

ALTER TABLE public.grocery_hauls
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_hauls'::regclass
      AND conname = 'grocery_hauls_title_nonblank'
  ) THEN
    ALTER TABLE public.grocery_hauls
      ADD CONSTRAINT grocery_hauls_title_nonblank
      CHECK (title IS NULL OR btrim(title) <> '');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_hauls'::regclass
      AND conname = 'grocery_hauls_budget_nonnegative'
  ) THEN
    ALTER TABLE public.grocery_hauls
      ADD CONSTRAINT grocery_hauls_budget_nonnegative
      CHECK (budget_amount IS NULL OR budget_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_hauls'::regclass
      AND conname = 'grocery_hauls_currency_format'
  ) THEN
    ALTER TABLE public.grocery_hauls
      ADD CONSTRAINT grocery_hauls_currency_format
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END
$$;

ALTER TABLE public.grocery_haul_items
  ADD COLUMN IF NOT EXISTS final_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS selected_food_object_id UUID,
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
  ADD COLUMN IF NOT EXISTS package_size NUMERIC,
  ADD COLUMN IF NOT EXISTS package_unit TEXT,
  ADD COLUMN IF NOT EXISTS package_count NUMERIC,
  ADD COLUMN IF NOT EXISTS retailer TEXT,
  ADD COLUMN IF NOT EXISTS store_location TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS price_currency TEXT,
  ADD COLUMN IF NOT EXISTS price_source TEXT,
  ADD COLUMN IF NOT EXISTS source_purchasing_choice_id UUID,
  ADD COLUMN IF NOT EXISTS source_price_observation_id UUID,
  ADD COLUMN IF NOT EXISTS resolution_source TEXT,
  ADD COLUMN IF NOT EXISTS price_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows receive a one-time preparation baseline. Reapply does not
-- rewrite edited final quantities because only NULL rows are initialized.
UPDATE public.grocery_haul_items
SET final_quantity = COALESCE(quantity_snapshot, 1)
WHERE final_quantity IS NULL;

ALTER TABLE public.grocery_haul_items
  ALTER COLUMN final_quantity SET DEFAULT 1,
  ALTER COLUMN final_quantity SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_final_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_final_quantity_nonnegative
      CHECK (final_quantity >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_package_size_positive'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_package_size_positive
      CHECK (package_size IS NULL OR package_size > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_package_count_positive'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_package_count_positive
      CHECK (package_count IS NULL OR package_count > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_price_nonnegative'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_price_nonnegative
      CHECK (price_amount IS NULL OR price_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_price_currency_format'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_price_currency_format
      CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_price_state_consistent'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_price_state_consistent
      CHECK (
        (price_amount IS NULL AND price_currency IS NULL AND price_source IS NULL)
        OR (
          price_amount IS NOT NULL
          AND price_currency IS NOT NULL
          AND price_source IN ('manual', 'sourced')
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_resolution_source_check'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_resolution_source_check
      CHECK (
        resolution_source IS NULL
        OR resolution_source IN ('source_list', 'haul_edit')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_selected_food_object_fkey'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_selected_food_object_fkey
      FOREIGN KEY (selected_food_object_id)
      REFERENCES public.food_objects(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_person_haul_final
  ON public.grocery_haul_items (person_id, haul_id, final_quantity);

COMMENT ON COLUMN public.grocery_haul_items.quantity_snapshot IS
  'Immutable source-List demand quantity copied when this source item joined the Haul. Never mutable final purchase quantity.';
COMMENT ON COLUMN public.grocery_haul_items.final_quantity IS
  'Mutable final Haul purchase quantity. Zero excludes the line from execution and estimate.';
COMMENT ON COLUMN public.grocery_haul_items.price_amount IS
  'Persisted price per final purchase unit/package. Estimate multiplies by final_quantity; no tax is implied.';
COMMENT ON COLUMN public.grocery_haul_items.resolution_source IS
  'source_list when initialized from List truth; haul_edit after a Haul-only preparation edit.';
COMMENT ON COLUMN public.grocery_haul_items.source_purchasing_choice_id IS
  'Copied initialization provenance only; deliberately no FK so later List choice deletion cannot mutate or block Haul history.';
COMMENT ON COLUMN public.grocery_haul_items.source_price_observation_id IS
  'Copied/selected price provenance only; deliberately no FK so later List price deletion cannot mutate prepared Haul state.';

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_item_preparation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_only_reference_cleanup BOOLEAN;
BEGIN
  IF NEW.haul_id IS DISTINCT FROM OLD.haul_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.source_grocery_list_id IS DISTINCT FROM OLD.source_grocery_list_id
     OR NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot
     OR NEW.quantity_snapshot IS DISTINCT FROM OLD.quantity_snapshot
     OR NEW.unit_snapshot IS DISTINCT FROM OLD.unit_snapshot
     OR NEW.source_status_snapshot IS DISTINCT FROM OLD.source_status_snapshot
     OR NEW.source_type_snapshot IS DISTINCT FROM OLD.source_type_snapshot
     OR NEW.source_id_snapshot IS DISTINCT FROM OLD.source_id_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE';
  END IF;

  -- Preserve the foundation's ON DELETE SET NULL behavior for historical
  -- pointers. The copied name/quantity/unit/source snapshots remain frozen.
  v_only_reference_cleanup :=
    (
      NEW.grocery_item_id IS NOT DISTINCT FROM OLD.grocery_item_id
      OR (OLD.grocery_item_id IS NOT NULL AND NEW.grocery_item_id IS NULL)
    )
    AND (
      NEW.food_object_id_snapshot IS NOT DISTINCT FROM OLD.food_object_id_snapshot
      OR (
        OLD.food_object_id_snapshot IS NOT NULL
        AND NEW.food_object_id_snapshot IS NULL
      )
    )
    AND (
      NEW.selected_food_object_id IS NOT DISTINCT FROM OLD.selected_food_object_id
      OR (
        OLD.selected_food_object_id IS NOT NULL
        AND NEW.selected_food_object_id IS NULL
      )
    )
    AND NEW.final_quantity IS NOT DISTINCT FROM OLD.final_quantity
    AND NEW.product_title IS NOT DISTINCT FROM OLD.product_title
    AND NEW.brand_name IS NOT DISTINCT FROM OLD.brand_name
    AND NEW.purchase_unit IS NOT DISTINCT FROM OLD.purchase_unit
    AND NEW.package_size IS NOT DISTINCT FROM OLD.package_size
    AND NEW.package_unit IS NOT DISTINCT FROM OLD.package_unit
    AND NEW.package_count IS NOT DISTINCT FROM OLD.package_count
    AND NEW.retailer IS NOT DISTINCT FROM OLD.retailer
    AND NEW.store_location IS NOT DISTINCT FROM OLD.store_location
    AND NEW.postal_code IS NOT DISTINCT FROM OLD.postal_code
    AND NEW.price_amount IS NOT DISTINCT FROM OLD.price_amount
    AND NEW.price_currency IS NOT DISTINCT FROM OLD.price_currency
    AND NEW.price_source IS NOT DISTINCT FROM OLD.price_source
    AND NEW.source_purchasing_choice_id IS NOT DISTINCT FROM OLD.source_purchasing_choice_id
    AND NEW.source_price_observation_id IS NOT DISTINCT FROM OLD.source_price_observation_id
    AND NEW.resolution_source IS NOT DISTINCT FROM OLD.resolution_source
    AND NEW.price_retrieved_at IS NOT DISTINCT FROM OLD.price_retrieved_at;

  IF v_only_reference_cleanup
     AND (
       NEW.grocery_item_id IS DISTINCT FROM OLD.grocery_item_id
       OR NEW.food_object_id_snapshot IS DISTINCT FROM OLD.food_object_id_snapshot
       OR NEW.selected_food_object_id IS DISTINCT FROM OLD.selected_food_object_id
     ) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.grocery_item_id IS DISTINCT FROM OLD.grocery_item_id
     OR NEW.food_object_id_snapshot IS DISTINCT FROM OLD.food_object_id_snapshot THEN
    RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE';
  END IF;

  SELECT status INTO v_status
  FROM public.grocery_hauls
  WHERE id = OLD.haul_id AND person_id = OLD.person_id
  FOR UPDATE;

  IF v_status IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'HAUL_PREPARATION_NOT_DRAFT';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_haul_items_preparation_guard
  ON public.grocery_haul_items;
CREATE TRIGGER grocery_haul_items_preparation_guard
  BEFORE UPDATE ON public.grocery_haul_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_item_preparation();

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('closed', 'cancelled')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'HAUL_STATUS_HISTORICAL';
  END IF;
  IF (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.shopping_date IS DISTINCT FROM OLD.shopping_date
    OR NEW.budget_amount IS DISTINCT FROM OLD.budget_amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
  ) AND OLD.status IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'HAUL_PREPARATION_NOT_DRAFT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_hauls_preparation_guard ON public.grocery_hauls;
CREATE TRIGGER grocery_hauls_preparation_guard
  BEFORE UPDATE ON public.grocery_hauls
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_metadata();

-- All application writes use owner-scoped server services/RPCs. RLS remains
-- defense in depth for reads, while direct client writes cannot forge/delete
-- snapshot, membership, preparation, or lifecycle truth.
REVOKE ALL PRIVILEGES ON public.grocery_hauls FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.grocery_haul_items FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.grocery_haul_source_lists FROM anon, authenticated;
GRANT SELECT ON public.grocery_hauls TO anon, authenticated;
GRANT SELECT ON public.grocery_haul_items TO anon, authenticated;
GRANT SELECT ON public.grocery_haul_source_lists TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_hauls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_haul_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_haul_source_lists TO service_role;

-- Shared insert shape for initial creation remains in the RPC so Haul
-- snapshots and their preparation baseline commit atomically.
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
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CREATE_FORBIDDEN';
  END IF;
  IF (
    SELECT count(*) FROM public.generated_grocery_lists
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
      person_id, source_grocery_list_id, shopping_date, status,
      creation_token, title, currency
    ) VALUES (
      p_person_id, v_primary_list_id, p_shopping_date, 'planned',
      p_creation_token, 'Haul · ' || to_char(p_shopping_date, 'Mon FMDD'), 'USD'
    )
    RETURNING * INTO v_haul;
    v_created := TRUE;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'idx_grocery_hauls_person_creation_token'
         OR SQLERRM ILIKE '%idx_grocery_hauls_person_creation_token%' THEN
        SELECT * INTO v_haul
        FROM public.grocery_hauls
        WHERE person_id = p_person_id AND creation_token = p_creation_token;
        IF NOT FOUND THEN RAISE EXCEPTION 'HAUL_CREATE_TOKEN_RACE'; END IF;

        SELECT array_agg(grocery_list_id ORDER BY grocery_list_id)
        INTO v_existing_members
        FROM public.grocery_haul_source_lists
        WHERE haul_id = v_haul.id AND person_id = p_person_id;
        SELECT array_agg(source_id ORDER BY source_id)
        INTO v_requested_members
        FROM unnest(v_source_list_ids) AS source(source_id);

        IF v_haul.source_grocery_list_id IS DISTINCT FROM v_primary_list_id
           OR v_haul.shopping_date IS DISTINCT FROM p_shopping_date
           OR v_existing_members IS DISTINCT FROM v_requested_members THEN
          RAISE EXCEPTION 'HAUL_CREATE_TOKEN_MISMATCH';
        END IF;
      ELSIF v_constraint = 'idx_grocery_hauls_open_list_date'
            OR SQLERRM ILIKE '%idx_grocery_hauls_open_list_date%' THEN
        RAISE EXCEPTION 'HAUL_CREATE_OPEN_EXISTS';
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_created THEN
    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.grocery_haul_items
    WHERE haul_id = v_haul.id AND person_id = p_person_id;
    RETURN jsonb_build_object(
      'haul_id', v_haul.id, 'person_id', v_haul.person_id,
      'source_grocery_list_id', v_haul.source_grocery_list_id,
      'source_grocery_list_ids', to_jsonb(v_source_list_ids),
      'shopping_date', v_haul.shopping_date, 'status', v_haul.status,
      'creation_token', v_haul.creation_token, 'item_count', v_item_count,
      'outcome', 'reused'
    );
  END IF;

  INSERT INTO public.grocery_haul_source_lists (haul_id, grocery_list_id, person_id)
  SELECT v_haul.id, source_id, p_person_id
  FROM unnest(v_source_list_ids) AS source(source_id);

  INSERT INTO public.grocery_haul_items (
    haul_id, person_id, source_grocery_list_id, grocery_item_id,
    name_snapshot, quantity_snapshot, unit_snapshot, food_object_id_snapshot,
    source_status_snapshot, source_type_snapshot, source_id_snapshot,
    final_quantity, selected_food_object_id, product_title, brand_name,
    purchase_unit, package_size, package_unit, package_count, retailer,
    postal_code, price_amount, price_currency, price_source,
    source_purchasing_choice_id, source_price_observation_id,
    resolution_source, price_retrieved_at
  )
  SELECT
    v_haul.id, p_person_id, gi.grocery_list_id, gi.id,
    gi.name, gi.quantity, gi.unit, gi.food_object_id,
    gi.status, gi.source_type, gi.source_id,
    COALESCE(price.package_count, choice.purchase_quantity, gi.quantity, 1),
    choice.food_object_id,
    COALESCE(price.product_title, choice.preferred_product, choice.shopping_display_name),
    price.brand_name, choice.purchase_unit, price.package_size,
    price.package_unit, price.package_count, price.retailer, price.postal_code,
    price.unit_price, price.currency,
    CASE WHEN price.id IS NULL THEN NULL
         WHEN price.source = 'manual' THEN 'manual' ELSE 'sourced' END,
    choice.id, price.id,
    CASE WHEN choice.id IS NOT NULL OR price.id IS NOT NULL
         THEN 'source_list' ELSE NULL END,
    price.retrieved_at
  FROM public.grocery_items gi
  LEFT JOIN public.grocery_list_purchasing_choices choice
    ON choice.grocery_list_id = gi.grocery_list_id
   AND choice.grocery_item_id = gi.id
   AND choice.person_id = p_person_id
   AND choice.status <> 'unresolved'
  LEFT JOIN public.grocery_list_item_active_quotes active_price
    ON active_price.grocery_list_id = gi.grocery_list_id
   AND active_price.grocery_item_id = gi.id
   AND active_price.person_id = p_person_id
  LEFT JOIN public.grocery_list_price_observations price
    ON price.id = active_price.observation_id
   AND price.grocery_list_id = gi.grocery_list_id
   AND price.grocery_item_id = gi.id
   AND price.person_id = p_person_id
   AND (
     choice.id IS NULL
     OR price.purchasing_choice_id = choice.id
     OR price.match_key = choice.match_key
     OR (
       choice.food_object_id IS NOT NULL
       AND price.food_object_id = choice.food_object_id
     )
   )
   AND (
     choice.purchase_unit IS NULL
     OR price.package_unit IS NULL
     OR lower(btrim(choice.purchase_unit)) = lower(btrim(price.package_unit))
   )
  WHERE gi.grocery_list_id = ANY(v_source_list_ids)
    AND gi.person_id = p_person_id
    AND gi.status = 'pending'
  ORDER BY array_position(v_source_list_ids, gi.grocery_list_id), gi.created_at, gi.id;

  GET DIAGNOSTICS v_item_count = ROW_COUNT;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'HAUL_CREATE_NO_PENDING_ITEMS'; END IF;

  RETURN jsonb_build_object(
    'haul_id', v_haul.id, 'person_id', v_haul.person_id,
    'source_grocery_list_id', v_haul.source_grocery_list_id,
    'source_grocery_list_ids', to_jsonb(v_source_list_ids),
    'shopping_date', v_haul.shopping_date, 'status', v_haul.status,
    'creation_token', v_haul.creation_token, 'item_count', v_item_count,
    'outcome', 'created'
  );
END;
$$;

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
    p_person_id, ARRAY[p_source_grocery_list_id],
    p_shopping_date, p_creation_token
  );
$$;

CREATE OR REPLACE FUNCTION public.add_grocery_lists_to_haul(
  p_person_id UUID,
  p_haul_id UUID,
  p_source_grocery_list_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_list_ids UUID[];
  v_missing_list_ids UUID[];
  v_added_source_count INTEGER := 0;
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

  IF p_person_id IS NULL OR p_haul_id IS NULL
     OR COALESCE(cardinality(v_source_list_ids), 0) = 0 THEN
    RAISE EXCEPTION 'HAUL_ADD_LISTS_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_ADD_LISTS_FORBIDDEN';
  END IF;

  PERFORM 1 FROM public.grocery_hauls
  WHERE id = p_haul_id AND person_id = p_person_id AND status = 'planned'
  FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.grocery_hauls
      WHERE id = p_haul_id AND person_id = p_person_id
    ) THEN
      RAISE EXCEPTION 'HAUL_ADD_LISTS_NOT_DRAFT';
    END IF;
    RAISE EXCEPTION 'HAUL_ADD_LISTS_NOT_FOUND';
  END IF;

  SELECT array_agg(source_id ORDER BY array_position(v_source_list_ids, source_id))
  INTO v_missing_list_ids
  FROM unnest(v_source_list_ids) AS source(source_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.grocery_haul_source_lists membership
    WHERE membership.haul_id = p_haul_id
      AND membership.grocery_list_id = source.source_id
      AND membership.person_id = p_person_id
  );

  IF COALESCE(cardinality(v_missing_list_ids), 0) = 0 THEN
    RETURN jsonb_build_object(
      'haul_id', p_haul_id, 'source_grocery_list_ids', to_jsonb(v_source_list_ids),
      'added_source_count', 0, 'item_count', 0, 'outcome', 'noop'
    );
  END IF;

  IF (
    SELECT count(*) FROM public.generated_grocery_lists
    WHERE id = ANY(v_missing_list_ids)
      AND person_id = p_person_id
      AND archived_at IS NULL
  ) <> cardinality(v_missing_list_ids) THEN
    RAISE EXCEPTION 'HAUL_ADD_LISTS_LIST_NOT_FOUND';
  END IF;

  INSERT INTO public.grocery_haul_source_lists (haul_id, grocery_list_id, person_id)
  SELECT p_haul_id, source_id, p_person_id
  FROM unnest(v_missing_list_ids) AS source(source_id)
  ON CONFLICT (haul_id, grocery_list_id) DO NOTHING;
  GET DIAGNOSTICS v_added_source_count = ROW_COUNT;

  INSERT INTO public.grocery_haul_items (
    haul_id, person_id, source_grocery_list_id, grocery_item_id,
    name_snapshot, quantity_snapshot, unit_snapshot, food_object_id_snapshot,
    source_status_snapshot, source_type_snapshot, source_id_snapshot,
    final_quantity, selected_food_object_id, product_title, brand_name,
    purchase_unit, package_size, package_unit, package_count, retailer,
    postal_code, price_amount, price_currency, price_source,
    source_purchasing_choice_id, source_price_observation_id,
    resolution_source, price_retrieved_at
  )
  SELECT
    p_haul_id, p_person_id, gi.grocery_list_id, gi.id,
    gi.name, gi.quantity, gi.unit, gi.food_object_id,
    gi.status, gi.source_type, gi.source_id,
    COALESCE(price.package_count, choice.purchase_quantity, gi.quantity, 1),
    choice.food_object_id,
    COALESCE(price.product_title, choice.preferred_product, choice.shopping_display_name),
    price.brand_name, choice.purchase_unit, price.package_size,
    price.package_unit, price.package_count, price.retailer, price.postal_code,
    price.unit_price, price.currency,
    CASE WHEN price.id IS NULL THEN NULL
         WHEN price.source = 'manual' THEN 'manual' ELSE 'sourced' END,
    choice.id, price.id,
    CASE WHEN choice.id IS NOT NULL OR price.id IS NOT NULL
         THEN 'source_list' ELSE NULL END,
    price.retrieved_at
  FROM public.grocery_items gi
  LEFT JOIN public.grocery_list_purchasing_choices choice
    ON choice.grocery_list_id = gi.grocery_list_id
   AND choice.grocery_item_id = gi.id
   AND choice.person_id = p_person_id
   AND choice.status <> 'unresolved'
  LEFT JOIN public.grocery_list_item_active_quotes active_price
    ON active_price.grocery_list_id = gi.grocery_list_id
   AND active_price.grocery_item_id = gi.id
   AND active_price.person_id = p_person_id
  LEFT JOIN public.grocery_list_price_observations price
    ON price.id = active_price.observation_id
   AND price.grocery_list_id = gi.grocery_list_id
   AND price.grocery_item_id = gi.id
   AND price.person_id = p_person_id
   AND (
     choice.id IS NULL
     OR price.purchasing_choice_id = choice.id
     OR price.match_key = choice.match_key
     OR (
       choice.food_object_id IS NOT NULL
       AND price.food_object_id = choice.food_object_id
     )
   )
   AND (
     choice.purchase_unit IS NULL
     OR price.package_unit IS NULL
     OR lower(btrim(choice.purchase_unit)) = lower(btrim(price.package_unit))
   )
  WHERE gi.grocery_list_id = ANY(v_missing_list_ids)
    AND gi.person_id = p_person_id
    AND gi.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.grocery_haul_items existing
      WHERE existing.haul_id = p_haul_id
        AND existing.person_id = p_person_id
        AND existing.grocery_item_id = gi.id
    )
  ORDER BY array_position(v_missing_list_ids, gi.grocery_list_id), gi.created_at, gi.id
  ON CONFLICT (haul_id, grocery_item_id) DO NOTHING;
  GET DIAGNOSTICS v_item_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'haul_id', p_haul_id, 'source_grocery_list_ids', to_jsonb(v_source_list_ids),
    'added_source_count', v_added_source_count, 'item_count', v_item_count,
    'outcome', 'updated'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_grocery_haul_from_lists(UUID, UUID[], DATE, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.add_grocery_lists_to_haul(UUID, UUID, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_grocery_lists_to_haul(UUID, UUID, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_grocery_lists_to_haul(UUID, UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_grocery_lists_to_haul(UUID, UUID, UUID[]) TO service_role;

COMMENT ON FUNCTION public.add_grocery_lists_to_haul(UUID, UUID, UUID[]) IS
  'Atomically adds missing same-owner active List memberships and snapshots only new pending source items into a planned Haul. Existing memberships/items are no-op and source Lists are never mutated.';

-- Atomic pending -> in_basket transition with current-preparation acquisition truth.
-- Apply with allowActiveHaulPendingPreparationEdits.sql after source review.

CREATE OR REPLACE FUNCTION public.mark_grocery_haul_execution_in_basket(
  p_person_id UUID,
  p_haul_id UUID,
  p_execution_item_id UUID,
  p_acquisition_overlay JSONB DEFAULT NULL
) RETURNS public.grocery_haul_execution_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_execution public.grocery_haul_execution_items%ROWTYPE;
  v_item public.grocery_haul_items%ROWTYPE;
  v_haul_status TEXT;
  v_currency TEXT;
  v_overlay JSONB;
  v_preserve_substitute BOOLEAN;
  v_qty NUMERIC;
  v_food UUID;
  v_product TEXT;
  v_brand TEXT;
  v_purchase_unit TEXT;
  v_package_size NUMERIC;
  v_package_unit TEXT;
  v_package_count NUMERIC;
  v_retailer TEXT;
  v_store TEXT;
  v_postal TEXT;
  v_price NUMERIC;
  v_price_currency TEXT;
BEGIN
  IF p_person_id IS NULL OR p_haul_id IS NULL OR p_execution_item_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_ARGS';
  END IF;

  SELECT status, currency INTO v_haul_status, v_currency
  FROM public.grocery_hauls
  WHERE id = p_haul_id AND person_id = p_person_id
  FOR UPDATE;
  IF v_haul_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_execution
  FROM public.grocery_haul_execution_items
  WHERE id = p_execution_item_id
    AND haul_id = p_haul_id
    AND person_id = p_person_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAUL_EXECUTION_NOT_FOUND'; END IF;
  IF v_execution.state IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_INVALID_TRANSITION';
  END IF;

  SELECT * INTO v_item
  FROM public.grocery_haul_items
  WHERE id = v_execution.haul_item_id
    AND haul_id = p_haul_id
    AND person_id = p_person_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAUL_EXECUTION_NOT_FOUND'; END IF;
  IF v_item.final_quantity <= 0 THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_NOT_EXECUTABLE';
  END IF;

  v_overlay := COALESCE(p_acquisition_overlay, '{}'::JSONB);
  v_preserve_substitute := v_overlay = '{}'::JSONB AND (
    v_execution.acquired_quantity IS DISTINCT FROM v_item.final_quantity
    OR v_execution.acquired_food_object_id IS DISTINCT FROM v_item.selected_food_object_id
    OR v_execution.acquired_product_title IS DISTINCT FROM v_item.product_title
    OR v_execution.acquired_brand_name IS DISTINCT FROM v_item.brand_name
    OR v_execution.acquired_purchase_unit IS DISTINCT FROM v_item.purchase_unit
    OR v_execution.acquired_package_size IS DISTINCT FROM v_item.package_size
    OR v_execution.acquired_package_unit IS DISTINCT FROM v_item.package_unit
    OR v_execution.acquired_package_count IS DISTINCT FROM v_item.package_count
    OR v_execution.acquired_retailer IS DISTINCT FROM v_item.retailer
    OR v_execution.acquired_store_location IS DISTINCT FROM v_item.store_location
    OR v_execution.acquired_postal_code IS DISTINCT FROM v_item.postal_code
    OR v_execution.acquired_price_amount IS DISTINCT FROM v_item.price_amount
    OR v_execution.acquired_price_currency IS DISTINCT FROM COALESCE(
      v_item.price_currency,
      CASE WHEN v_item.price_amount IS NULL THEN NULL ELSE v_currency END
    )
  );

  IF v_preserve_substitute THEN
    UPDATE public.grocery_haul_execution_items
    SET
      state = 'in_basket',
      state_changed_at = now(),
      basketed_at = now(),
      updated_at = now()
    WHERE id = p_execution_item_id
    RETURNING * INTO v_execution;
    RETURN v_execution;
  END IF;

  v_qty := v_item.final_quantity;
  v_food := v_item.selected_food_object_id;
  v_product := v_item.product_title;
  v_brand := v_item.brand_name;
  v_purchase_unit := v_item.purchase_unit;
  v_package_size := v_item.package_size;
  v_package_unit := v_item.package_unit;
  v_package_count := v_item.package_count;
  v_retailer := v_item.retailer;
  v_store := v_item.store_location;
  v_postal := v_item.postal_code;
  v_price := v_item.price_amount;
  v_price_currency := CASE
    WHEN v_item.price_amount IS NULL THEN NULL
    ELSE COALESCE(v_item.price_currency, v_currency)
  END;

  IF v_overlay ? 'acquired_quantity' THEN
    v_qty := (v_overlay->>'acquired_quantity')::NUMERIC;
  END IF;
  IF v_overlay ? 'acquired_food_object_id' THEN
    v_food := NULLIF(v_overlay->>'acquired_food_object_id', '')::UUID;
  END IF;
  IF v_overlay ? 'acquired_product_title' THEN
    v_product := NULLIF(v_overlay->>'acquired_product_title', '');
  END IF;
  IF v_overlay ? 'acquired_brand_name' THEN
    v_brand := NULLIF(v_overlay->>'acquired_brand_name', '');
  END IF;
  IF v_overlay ? 'acquired_purchase_unit' THEN
    v_purchase_unit := NULLIF(v_overlay->>'acquired_purchase_unit', '');
  END IF;
  IF v_overlay ? 'acquired_package_size' THEN
    v_package_size := (v_overlay->>'acquired_package_size')::NUMERIC;
  END IF;
  IF v_overlay ? 'acquired_package_unit' THEN
    v_package_unit := NULLIF(v_overlay->>'acquired_package_unit', '');
  END IF;
  IF v_overlay ? 'acquired_package_count' THEN
    v_package_count := (v_overlay->>'acquired_package_count')::NUMERIC;
  END IF;
  IF v_overlay ? 'acquired_retailer' THEN
    v_retailer := NULLIF(v_overlay->>'acquired_retailer', '');
  END IF;
  IF v_overlay ? 'acquired_store_location' THEN
    v_store := NULLIF(v_overlay->>'acquired_store_location', '');
  END IF;
  IF v_overlay ? 'acquired_postal_code' THEN
    v_postal := NULLIF(v_overlay->>'acquired_postal_code', '');
  END IF;
  IF v_overlay ? 'acquired_price_amount' THEN
    v_price := (v_overlay->>'acquired_price_amount')::NUMERIC;
  END IF;
  IF v_overlay ? 'acquired_price_currency' THEN
    v_price_currency := NULLIF(v_overlay->>'acquired_price_currency', '');
  ELSIF v_overlay ? 'acquired_price_amount' AND v_price IS NOT NULL THEN
    v_price_currency := v_currency;
  END IF;

  UPDATE public.grocery_haul_execution_items
  SET
    state = 'in_basket',
    state_changed_at = now(),
    basketed_at = now(),
    acquired_quantity = v_qty,
    acquired_food_object_id = v_food,
    acquired_product_title = v_product,
    acquired_brand_name = v_brand,
    acquired_purchase_unit = v_purchase_unit,
    acquired_package_size = v_package_size,
    acquired_package_unit = v_package_unit,
    acquired_package_count = v_package_count,
    acquired_retailer = v_retailer,
    acquired_store_location = v_store,
    acquired_postal_code = v_postal,
    acquired_price_amount = v_price,
    acquired_price_currency = v_price_currency,
    acquisition_updated_at = now(),
    updated_at = now()
  WHERE id = p_execution_item_id
  RETURNING * INTO v_execution;

  RETURN v_execution;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_grocery_haul_execution_in_basket(UUID, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_grocery_haul_execution_in_basket(UUID, UUID, UUID, JSONB) TO service_role;

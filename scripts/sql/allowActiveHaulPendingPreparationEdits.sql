-- Active Haul preparation edits for pending execution lines only.
-- Apply explicitly to Supabase; not run automatically from app deploy.

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_item_preparation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_execution_state TEXT;
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

  IF v_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'HAUL_PREPARATION_HISTORICAL';
  END IF;

  IF v_status = 'planned' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_status = 'active' THEN
    SELECT execution.state INTO v_execution_state
    FROM public.grocery_haul_execution_items execution
    WHERE execution.haul_item_id = OLD.id
      AND execution.haul_id = OLD.haul_id
      AND execution.person_id = OLD.person_id
    FOR UPDATE;

    IF v_execution_state IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'HAUL_PREPARATION_EXECUTION_LOCKED';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'HAUL_PREPARATION_NOT_DRAFT';
END;
$$;

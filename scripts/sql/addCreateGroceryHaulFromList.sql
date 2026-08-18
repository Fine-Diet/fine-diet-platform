-- ============================================================================
-- Packet 11C — Atomic List → Haul creation RPC
--
-- Review-first. Adds one function, create_grocery_haul_from_list, so a
-- grocery_hauls row and its grocery_haul_items snapshots commit or roll back
-- together. Depends on Packet 11A tables/indexes (createGroceryHaulFoundation.sql).
--
-- Does NOT create tables/columns, mutate Grocery List or Pantry rows, infer
-- retailer/store, price, checkout, receipt, or add app/API/UI.
--
-- Uniqueness remains the authority:
--   idx_grocery_hauls_person_creation_token  — same-token exact semantic replay
--     reuses the Haul; same token with different list/date raises
--     HAUL_CREATE_TOKEN_MISMATCH (no new rows)
--   idx_grocery_hauls_open_list_date         — one open Haul per list+date
-- Never check-then-insert for those collisions.
--
-- Atomicity: Postgres executes a function body as one statement. There is no
-- EXCEPTION handler around grocery_haul_items inserts. Zero pending items and
-- any item-insert failure RAISE after the Haul INSERT and abort the statement,
-- so no Haul row remains. Nested unique_violation handling around the Haul
-- INSERT is a subtransaction; a later outer exception still rolls it back.
--
-- Security: SECURITY INVOKER (not DEFINER). search_path pinned. PUBLIC execute
-- revoked, plus explicit EXECUTE revokes from anon and authenticated so source
-- matches live service-role-only ACL. EXECUTE granted only to service_role
-- (same as activate_generated_plan / extend_plan_horizon_through_date).
-- Explicit list ownership check. If auth.uid() is present (future
-- authenticated GRANT), person must match JWT.
--
-- Managed `supabase/migrations` history in this repository is incomplete.
-- Follow the grocery-domain convention: idempotent scripts under scripts/sql.
-- Do NOT apply to production or a shared remote database unless separately
-- authorized after review.
--
-- Rollback: scripts/sql/rollbackCreateGroceryHaulFromList.sql
-- Isolated verification: scripts/sql/verifyCreateGroceryHaulFromList.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_grocery_haul_from_list(
  p_person_id UUID,
  p_source_grocery_list_id UUID,
  p_shopping_date DATE,
  p_creation_token UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul public.grocery_hauls%ROWTYPE;
  v_constraint TEXT;
  v_created BOOLEAN := FALSE;
  v_item_count INTEGER := 0;
  v_outcome TEXT;
BEGIN
  IF p_person_id IS NULL
     OR p_source_grocery_list_id IS NULL
     OR p_shopping_date IS NULL
     OR p_creation_token IS NULL THEN
    RAISE EXCEPTION 'HAUL_CREATE_INVALID_ARGS';
  END IF;

  -- Caller identity: JWT person when present; service_role calls have auth.uid()
  -- NULL and must still pass a person that owns the source list.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_person_id
      AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CREATE_FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.generated_grocery_lists
    WHERE id = p_source_grocery_list_id
      AND person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'HAUL_CREATE_LIST_NOT_FOUND';
  END IF;

  -- Serialize concurrent creates for the same person+list. Uniqueness indexes
  -- remain the collision authority; this lock only orders retries.
  PERFORM pg_advisory_xact_lock(
    hashtext('create_grocery_haul_from_list'),
    hashtext(p_person_id::text || ':' || p_source_grocery_list_id::text)
  );

  -- HAUL_INSERT_BEGIN: uniqueness-authoritative insert. Do not pre-check
  -- creation_token or open list/date before this INSERT.
  BEGIN
    INSERT INTO public.grocery_hauls (
      person_id,
      source_grocery_list_id,
      shopping_date,
      status,
      creation_token
    ) VALUES (
      p_person_id,
      p_source_grocery_list_id,
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
        -- Exact semantic replay only: same person + list + shopping_date.
        -- Different list/date for an existing token is a deterministic mismatch,
        -- not a reuse and not an open-Haul collision.
        IF v_haul.source_grocery_list_id IS DISTINCT FROM p_source_grocery_list_id
           OR v_haul.shopping_date IS DISTINCT FROM p_shopping_date THEN
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
  -- HAUL_INSERT_END

  IF NOT v_created THEN
    SELECT COUNT(*)::INTEGER
      INTO v_item_count
    FROM public.grocery_haul_items
    WHERE haul_id = v_haul.id
      AND person_id = p_person_id;
    v_outcome := 'reused';
    RETURN jsonb_build_object(
      'haul_id', v_haul.id,
      'person_id', v_haul.person_id,
      'source_grocery_list_id', v_haul.source_grocery_list_id,
      'shopping_date', v_haul.shopping_date,
      'status', v_haul.status,
      'creation_token', v_haul.creation_token,
      'item_count', v_item_count,
      'outcome', v_outcome
    );
  END IF;

  -- ITEM_INSERT_BEGIN: no EXCEPTION handler. Failure aborts the function and
  -- rolls back the Haul row. Source rows are revalidated as this person + list
  -- + pending before snapshot. Grocery List / Pantry rows are not updated.
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
    p_source_grocery_list_id,
    gi.id,
    gi.name,
    gi.quantity,
    gi.unit,
    gi.food_object_id,
    gi.status,
    gi.source_type,
    gi.source_id
  FROM public.grocery_items gi
  WHERE gi.grocery_list_id = p_source_grocery_list_id
    AND gi.person_id = p_person_id
    AND gi.status = 'pending';
  -- ITEM_INSERT_END

  GET DIAGNOSTICS v_item_count = ROW_COUNT;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'HAUL_CREATE_NO_PENDING_ITEMS';
  END IF;

  v_outcome := 'created';
  RETURN jsonb_build_object(
    'haul_id', v_haul.id,
    'person_id', v_haul.person_id,
    'source_grocery_list_id', v_haul.source_grocery_list_id,
    'shopping_date', v_haul.shopping_date,
    'status', v_haul.status,
    'creation_token', v_haul.creation_token,
    'item_count', v_item_count,
    'outcome', v_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) TO service_role;

COMMENT ON FUNCTION public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID) IS
  'Atomically create a planned Haul and pending-item snapshots from a source Grocery List. Same (person_id, creation_token) retries reuse only when source_grocery_list_id and shopping_date also match; otherwise HAUL_CREATE_TOKEN_MISMATCH. Does not mutate List or Pantry. SECURITY INVOKER; execute granted to service_role only.';

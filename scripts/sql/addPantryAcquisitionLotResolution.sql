-- ============================================================================
-- Pantry acquisition-lot resolution (completed / disposed)
--
-- Durable lifecycle facts for open lots. Does not mutate pantry_on_hand_items.
-- DO NOT apply remotely until source review clears this migration.
-- ============================================================================

ALTER TABLE public.pantry_acquisition_lots
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposed_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS disposition_reason TEXT;

ALTER TABLE public.pantry_acquisition_lots
  DROP CONSTRAINT IF EXISTS pantry_acquisition_lots_resolution_status_check;

ALTER TABLE public.pantry_acquisition_lots
  ADD CONSTRAINT pantry_acquisition_lots_resolution_status_check
    CHECK (resolution_status IN ('open', 'completed', 'disposed'));

ALTER TABLE public.pantry_acquisition_lots
  DROP CONSTRAINT IF EXISTS pantry_acquisition_lots_disposed_quantity_nonnegative;

ALTER TABLE public.pantry_acquisition_lots
  ADD CONSTRAINT pantry_acquisition_lots_disposed_quantity_nonnegative
    CHECK (disposed_quantity IS NULL OR disposed_quantity >= 0);

ALTER TABLE public.pantry_acquisition_lots
  DROP CONSTRAINT IF EXISTS pantry_acquisition_lots_disposition_reason_check;

ALTER TABLE public.pantry_acquisition_lots
  ADD CONSTRAINT pantry_acquisition_lots_disposition_reason_check
    CHECK (
      disposition_reason IS NULL
      OR disposition_reason IN ('expired', 'manual', 'other')
    );

ALTER TABLE public.pantry_acquisition_lots
  DROP CONSTRAINT IF EXISTS pantry_acquisition_lots_resolution_invariants;

ALTER TABLE public.pantry_acquisition_lots
  ADD CONSTRAINT pantry_acquisition_lots_resolution_invariants
    CHECK (
      (
        resolution_status = 'open'
        AND resolved_at IS NULL
        AND disposed_quantity IS NULL
        AND disposition_reason IS NULL
      )
      OR (
        resolution_status = 'completed'
        AND quantity_remaining = 0
        AND resolved_at IS NOT NULL
        AND disposed_quantity IS NULL
        AND disposition_reason IS NULL
      )
      OR (
        resolution_status = 'disposed'
        AND quantity_remaining = 0
        AND resolved_at IS NOT NULL
        AND disposed_quantity > 0
        AND disposition_reason IS NOT NULL
      )
    );

COMMENT ON COLUMN public.pantry_acquisition_lots.resolution_status IS
  'open | completed | disposed — terminal states are immutable in the Pantry UI.';

CREATE OR REPLACE FUNCTION public.guard_pantry_acquisition_lot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.resolution_status IN ('completed', 'disposed') THEN
    RAISE EXCEPTION 'TERMINAL_LOT_IMMUTABLE';
  END IF;

  IF (
    NEW.resolution_status IS DISTINCT FROM OLD.resolution_status
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
    OR NEW.disposed_quantity IS DISTINCT FROM OLD.disposed_quantity
    OR NEW.disposition_reason IS DISTINCT FROM OLD.disposition_reason
  ) AND COALESCE(current_setting('app.pantry_lot_lifecycle', true), '') <> '1' THEN
    RAISE EXCEPTION 'LIFECYCLE_UPDATE_FORBIDDEN';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pantry_acquisition_lots_guard_update
  ON public.pantry_acquisition_lots;
CREATE TRIGGER pantry_acquisition_lots_guard_update
  BEFORE UPDATE ON public.pantry_acquisition_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_pantry_acquisition_lot_update();

CREATE OR REPLACE FUNCTION public.resolve_pantry_acquisition_lot(
  p_person_id UUID,
  p_lot_id UUID,
  p_outcome TEXT
) RETURNS public.pantry_acquisition_lots
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.pantry_acquisition_lots;
BEGIN
  IF p_outcome NOT IN ('completed', 'disposed') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME';
  END IF;

  PERFORM set_config('app.pantry_lot_lifecycle', '1', true);

  SELECT * INTO v_row
  FROM public.pantry_acquisition_lots
  WHERE id = p_lot_id
    AND person_id = p_person_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  IF v_row.resolution_status <> 'open' THEN
    RAISE EXCEPTION 'LOT_ALREADY_RESOLVED';
  END IF;

  IF p_outcome = 'completed' THEN
    UPDATE public.pantry_acquisition_lots
      SET quantity_remaining = 0,
          resolution_status = 'completed',
          resolved_at = now(),
          disposed_quantity = NULL,
          disposition_reason = NULL,
          updated_at = now()
      WHERE id = p_lot_id
        AND person_id = p_person_id
      RETURNING * INTO v_row;
  ELSE
    IF v_row.quantity_remaining <= 0 THEN
      RAISE EXCEPTION 'NO_REMAINING_TO_DISPOSE';
    END IF;

    UPDATE public.pantry_acquisition_lots
      SET disposed_quantity = v_row.quantity_remaining,
          quantity_remaining = 0,
          resolution_status = 'disposed',
          resolved_at = now(),
          disposition_reason = CASE
            WHEN v_row.expires_on IS NOT NULL AND v_row.expires_on < CURRENT_DATE
              THEN 'expired'
            ELSE 'manual'
          END,
          updated_at = now()
      WHERE id = p_lot_id
        AND person_id = p_person_id
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pantry_acquisition_lot(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_pantry_acquisition_lot(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_pantry_acquisition_lot(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pantry_acquisition_lot(UUID, UUID, TEXT) TO service_role;

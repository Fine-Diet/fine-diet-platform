-- ============================================================================
-- PR #149 final correction pass — atomic, idempotent plan horizon extension
--
-- 1. Enforce slot-identity uniqueness within a plan_day so idempotent /
--    concurrent horizon extension can safely upsert without ever creating
--    duplicate slots for the same (plan_day_id, slot_ordinal).
-- 2. Add an atomic, idempotent, contiguity-checked RPC that extends a
--    plan's dated horizon through a required end date. Runs the full
--    extension (day inserts + slot inserts + end_date bump) inside a
--    single function invocation, which Postgres executes as one
--    statement-level unit within the calling transaction, so a crash
--    partway through never leaves a structurally incomplete day. An
--    advisory transaction lock serializes concurrent/repeated calls for
--    the same plan, and every insert uses ON CONFLICT DO NOTHING against
--    the unique indexes above, so repeated or racing calls are safe.
--
-- Applied directly via the Supabase MCP apply_migration tool as migrations
-- `add_atomic_plan_horizon_extension` and `pin_extend_plan_horizon_search_path`.
-- This file mirrors that migration for repo history/parity with the other
-- scripts/sql/*.sql files.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_slots_day_ordinal_unique
  ON public.plan_slots (plan_day_id, slot_ordinal);

CREATE OR REPLACE FUNCTION public.extend_plan_horizon_through_date(
  p_person_id UUID,
  p_plan_id UUID,
  p_required_end_date DATE,
  p_schedule_slots JSONB,
  p_nds_version TEXT,
  p_classifier_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_min_date DATE;
  v_max_date DATE;
  v_actual_count BIGINT;
  v_expected_count BIGINT;
  v_cursor DATE;
  v_day_id UUID;
  v_days_added INTEGER := 0;
  v_slot JSONB;
BEGIN
  -- Serialize concurrent/repeated extension requests for this plan across
  -- all app instances. Held for the duration of the calling transaction.
  PERFORM pg_advisory_xact_lock(hashtext('plan_horizon_extension'), hashtext(p_plan_id::text));

  PERFORM 1 FROM public.plans WHERE id = p_plan_id AND person_id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;

  SELECT min(date_local), max(date_local), count(*)
    INTO v_min_date, v_max_date, v_actual_count
  FROM public.plan_days
  WHERE plan_id = p_plan_id AND person_id = p_person_id;

  IF v_max_date IS NULL THEN
    RAISE EXCEPTION 'PLAN_HAS_NO_DAYS';
  END IF;

  v_expected_count := (v_max_date - v_min_date) + 1;
  IF v_expected_count <> v_actual_count THEN
    RAISE EXCEPTION 'PLAN_DAYS_NOT_CONTIGUOUS';
  END IF;

  -- Repair pass: backfill any missing structural slots on days that already
  -- exist (covers a prior partial failure that inserted a day but not all
  -- of its slots).
  FOR v_day_id IN
    SELECT id FROM public.plan_days
    WHERE plan_id = p_plan_id AND person_id = p_person_id
  LOOP
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.plan_slots (
        person_id, plan_day_id, slot_block, slot_ordinal, slot_label, target_time
      ) VALUES (
        p_person_id,
        v_day_id,
        v_slot->>'slot_block',
        (v_slot->>'slot_ordinal')::INT,
        v_slot->>'slot_label',
        NULLIF(v_slot->>'target_time', '')::TIME
      )
      ON CONFLICT (plan_day_id, slot_ordinal) DO NOTHING;
    END LOOP;
  END LOOP;

  IF p_required_end_date > v_max_date THEN
    v_cursor := v_max_date;
    WHILE v_cursor < p_required_end_date LOOP
      v_cursor := v_cursor + INTERVAL '1 day';

      INSERT INTO public.plan_days (
        person_id, plan_id, date_local,
        projected_nds_100, projected_wfr_10, projected_ps_10, projected_pnd_10,
        projected_fp_10, projected_as_10, projected_mnc_10, projected_ob_10,
        projection_confidence, projection_debug_json, notes,
        nds_version, classifier_version
      ) VALUES (
        p_person_id, p_plan_id, v_cursor,
        0, 0, 0, 0, 0, 0, 0, 0,
        'low', NULL, NULL,
        p_nds_version, p_classifier_version
      )
      ON CONFLICT (plan_id, date_local) DO NOTHING
      RETURNING id INTO v_day_id;

      IF v_day_id IS NULL THEN
        SELECT id INTO v_day_id FROM public.plan_days
          WHERE plan_id = p_plan_id AND date_local = v_cursor;
      ELSE
        v_days_added := v_days_added + 1;
      END IF;

      FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
      LOOP
        INSERT INTO public.plan_slots (
          person_id, plan_day_id, slot_block, slot_ordinal, slot_label, target_time
        ) VALUES (
          p_person_id,
          v_day_id,
          v_slot->>'slot_block',
          (v_slot->>'slot_ordinal')::INT,
          v_slot->>'slot_label',
          NULLIF(v_slot->>'target_time', '')::TIME
        )
        ON CONFLICT (plan_day_id, slot_ordinal) DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  UPDATE public.plans
    SET end_date = p_required_end_date,
        updated_at = now()
    WHERE id = p_plan_id AND person_id = p_person_id
      AND (end_date IS NULL OR end_date < p_required_end_date);

  RETURN jsonb_build_object(
    'days_added', v_days_added,
    'end_date', GREATEST(v_max_date, p_required_end_date)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.extend_plan_horizon_through_date(UUID, UUID, DATE, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_plan_horizon_through_date(UUID, UUID, DATE, JSONB, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.extend_plan_horizon_through_date IS
  'Atomic, idempotent, contiguity-checked plan horizon extension. Locks per-plan via advisory xact lock; safe under concurrency and retries.';

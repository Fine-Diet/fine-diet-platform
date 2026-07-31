-- ============================================================================
-- activate_generated_plan — atomic current-plan handoff
--
-- Makes a fully-persisted generated plan the sole active plan for a person.
-- Prior actives are archived (not deleted). Advisory lock serializes concurrent
-- generate/activate retries for the same person.
--
-- Intended call site: lib/plans/planServerService.persistAiPlan after all
-- plan_days / plan_slots / planned_meals for the draft plan are written.
--
-- DO NOT apply this to production from the review packet. Ship the SQL as a
-- managed migration only when approved; keep this file as the source of truth.
--
-- Rollback notes:
--   DROP FUNCTION IF EXISTS public.activate_generated_plan(UUID, UUID);
--   Application fallback (if RPC absent): leave generated plan as draft and
--   surface an error — never activate/archive via partial multi-statement
--   updates without this RPC once it is the contracted path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_generated_plan(
  p_person_id UUID,
  p_plan_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_archived INTEGER := 0;
BEGIN
  -- Serialize concurrent/retried activation for this person.
  PERFORM pg_advisory_xact_lock(
    hashtext('plan_current_activation'),
    hashtext(p_person_id::text)
  );

  SELECT status INTO v_status
  FROM public.plans
  WHERE id = p_plan_id AND person_id = p_person_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;

  IF v_status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'PLAN_NOT_ACTIVATABLE';
  END IF;

  -- Refuse to promote an incomplete generate (no days yet).
  IF NOT EXISTS (
    SELECT 1
    FROM public.plan_days
    WHERE plan_id = p_plan_id AND person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'PLAN_HAS_NO_DAYS';
  END IF;

  UPDATE public.plans
    SET status = 'archived',
        updated_at = now()
    WHERE person_id = p_person_id
      AND status = 'active'
      AND id <> p_plan_id;

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  UPDATE public.plans
    SET status = 'active',
        updated_at = now()
    WHERE id = p_plan_id
      AND person_id = p_person_id;

  RETURN jsonb_build_object(
    'plan_id', p_plan_id,
    'archived_count', v_archived
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_generated_plan(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_generated_plan(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.activate_generated_plan IS
  'Atomically activate a generated plan and archive other actives for the person. Safe under concurrency/retries via advisory xact lock.';

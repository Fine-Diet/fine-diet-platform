-- Additive paid-through cutoff and bounded no-event expiry worker.
-- Apply after stripeCustomerAccountsPrelive.sql,
-- stripeWebhookProcessingLeasePrelive.sql, and stripeAtomicFulfillmentPrelive.sql.
-- Does not touch legacy subscriptions or non-Stripe grants.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_stripe_offer_instances_expiry_due
  ON public.stripe_offer_instances(paid_through,id)
  WHERE status='active' AND stripe_subscription_id IS NOT NULL AND paid_through IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fd_expire_stripe_fulfillment(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
SET lock_timeout='3s' AS $$
DECLARE
  v_candidate record;
  v_instance public.stripe_offer_instances%ROWTYPE;
  v_program public.program_assignments%ROWTYPE;
  v_count integer := 0;
  v_grants integer := 0;
  v_affected integer := 0;
  v_assignments integer := 0;
  v_now timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN
    RAISE EXCEPTION 'Expiry batch must be between 1 and 500' USING ERRCODE='22023';
  END IF;
  v_now := clock_timestamp();
  -- First acquire the same person advisory lock used by fulfillment, then the
  -- row lock. This order prevents renewal/expiry deadlocks and serializes a
  -- late verified renewal against the cutoff transition.
  FOR v_candidate IN
    SELECT id,person_id FROM public.stripe_offer_instances
      WHERE status='active' AND stripe_subscription_id IS NOT NULL
        AND paid_through IS NOT NULL AND paid_through<=v_now
      ORDER BY paid_through,id LIMIT least(p_limit*4,2000)
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('fd-stripe-person:' || v_candidate.person_id::text,0)) THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_instance FROM public.stripe_offer_instances
      WHERE id=v_candidate.id AND person_id=v_candidate.person_id
        AND status='active' AND stripe_subscription_id IS NOT NULL
        AND paid_through IS NOT NULL AND paid_through<=v_now
      FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.person_entitlements SET is_active=false,updated_at=v_now
      WHERE person_id=v_instance.person_id AND source='stripe'
        AND source_ref=v_instance.stripe_subscription_id AND is_active;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_grants := v_grants+v_affected;

    FOR v_program IN SELECT * FROM public.program_assignments
      WHERE person_id=v_instance.person_id AND source_ref=v_instance.stripe_subscription_id
        AND auto_created AND acquisition_source='purchase' AND status='active'
      FOR UPDATE LOOP
      INSERT INTO public.stripe_program_suspensions(assignment_id,instance_id)
        VALUES(v_program.id,v_instance.id) ON CONFLICT (assignment_id) DO NOTHING;
      UPDATE public.program_assignments SET status='inactive',updated_at=v_now WHERE id=v_program.id;
      v_assignments := v_assignments+1;
    END LOOP;

    UPDATE public.stripe_offer_instances SET status='canceled',updated_at=v_now WHERE id=v_instance.id;
    v_count := v_count+1;
    EXIT WHEN v_count>=p_limit;
  END LOOP;
  RETURN jsonb_build_object('expired_purchases',v_count,'revoked_grants',v_grants,
    'suspended_assignments',v_assignments,'bounded',true);
END;
$$;
REVOKE ALL ON FUNCTION public.fd_expire_stripe_fulfillment(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fd_expire_stripe_fulfillment(integer) TO service_role;
COMMENT ON FUNCTION public.fd_expire_stripe_fulfillment(integer) IS
  'Bounded service-role-only no-event cutoff. Revokes only the matching subscription source and suspends only purchase-created assignments.';
COMMIT;

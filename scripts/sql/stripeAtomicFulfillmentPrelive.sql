-- DRAFT schema proposal. Run only in isolated validation until release review.
-- Dependencies: stripeCustomerAccountsPrelive.sql and stripeWebhookProcessingLeasePrelive.sql.
-- No legacy customer, entitlement, or assignment history is deleted or relabeled.
BEGIN;
ALTER TABLE public.stripe_offer_instances
  ADD COLUMN IF NOT EXISTS fulfillment_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean;
ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS fulfillment_instance_id uuid,
  ADD COLUMN IF NOT EXISTS fulfillment_account_id text,
  ADD COLUMN IF NOT EXISTS fulfillment_livemode boolean;

-- All instance updates advance the version, including legacy writers. Checking
-- only status is vulnerable to active -> canceled -> active (an ABA transition).
CREATE OR REPLACE FUNCTION public.fd_stripe_bump_fulfillment_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  NEW.fulfillment_revision := OLD.fulfillment_revision + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fd_stripe_bump_fulfillment_revision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fd_stripe_fulfillment_revision ON public.stripe_offer_instances;
CREATE TRIGGER fd_stripe_fulfillment_revision BEFORE UPDATE ON public.stripe_offer_instances
FOR EACH ROW EXECUTE FUNCTION public.fd_stripe_bump_fulfillment_revision();

-- Only assignments suspended by this path may be resumed by it. Do not revive
-- manually inactive, completed, or cancelled program assignments.
CREATE TABLE IF NOT EXISTS public.stripe_program_suspensions (
  assignment_id uuid PRIMARY KEY REFERENCES public.program_assignments(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.stripe_offer_instances(id) ON DELETE CASCADE,
  suspended_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_program_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_program_suspensions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_program_suspensions TO service_role;

-- One database transaction owns the purchase, grants, program changes, checkout
-- record, and completion receipt. No Stripe API request is made inside it.
-- Caller MUST read expected_revision BEFORE fetching current provider objects.
CREATE OR REPLACE FUNCTION public.fd_commit_stripe_fulfillment(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
SET lock_timeout = '3s' AS $$
DECLARE
  v_event public.stripe_events%ROWTYPE;
  v_instance public.stripe_offer_instances%ROWTYPE;
  v_grant public.person_entitlements%ROWTYPE;
  v_program public.program_assignments%ROWTYPE;
  v_instance_id uuid := (p_input->>'instance_id')::uuid;
  v_person_id uuid := (p_input->>'person_id')::uuid;
  v_event_id text := p_input->>'event_id';
  v_token text := p_input->>'token';
  v_account text := p_input->>'account_id';
  v_live boolean := (p_input->>'livemode')::boolean;
  v_revision bigint := (p_input->>'expected_revision')::bigint;
  v_source text := p_input->>'source_ref';
  v_state text := p_input->>'state';
  v_ids jsonb := coalesce(p_input->'identifiers','{}'::jsonb);
  v_mappings jsonb := coalesce(p_input->'entitlements','[]'::jsonb);
  v_checkout jsonb := p_input->'checkout_record';
  v_mapping jsonb;
  v_key text;
  v_days integer;
  v_slug text;
  v_sub text;
  v_payment text;
  v_count integer;
  v_now timestamptz;
  v_new_revision bigint;
BEGIN
  IF v_instance_id IS NULL OR v_person_id IS NULL OR v_revision IS NULL OR v_revision < 0
     OR v_event_id IS NULL OR v_token IS NULL OR v_token = ''
     OR v_account IS NULL OR v_account !~ '^acct_[A-Za-z0-9]+$' OR v_live IS NULL
     OR v_source IS NULL OR v_source = '' OR v_state IS NULL
     OR v_state NOT IN ('active','canceled','ended') THEN
    RAISE EXCEPTION 'Invalid fulfillment request' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(v_ids) <> 'object' OR jsonb_typeof(v_mappings) <> 'array'
     OR jsonb_array_length(v_mappings) > 100 THEN
    RAISE EXCEPTION 'Invalid fulfillment identifiers or mappings' USING ERRCODE='22023';
  END IF;

  SELECT * INTO STRICT v_event FROM public.stripe_events
    WHERE stripe_event_id=v_event_id FOR UPDATE;
  IF v_event.processed_at IS NOT NULL THEN
    IF v_event.fulfillment_instance_id IS NOT DISTINCT FROM v_instance_id
       AND v_event.fulfillment_account_id IS NOT DISTINCT FROM v_account
       AND v_event.fulfillment_livemode IS NOT DISTINCT FROM v_live THEN
      RETURN jsonb_build_object('status','already_processed','receipt_completed',true);
    END IF;
    RAISE EXCEPTION 'Completed receipt belongs to different fulfillment';
  END IF;
  IF v_event.processing_token IS DISTINCT FROM v_token
     OR v_event.processing_lease_expires_at IS NULL
     OR v_event.processing_lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Fulfillment claim lost or expired' USING ERRCODE='40001';
  END IF;

  -- Serialize this path for a person's competing purchases as well as this
  -- instance. Existing unique constraints remain intact and conflicts fail.
  PERFORM pg_advisory_xact_lock(hashtextextended('fd-stripe-person:' || v_person_id::text,0));
  SELECT * INTO STRICT v_instance FROM public.stripe_offer_instances
    WHERE id=v_instance_id FOR UPDATE;
  IF v_instance.person_id IS DISTINCT FROM v_person_id
     OR v_instance.offer_key IS DISTINCT FROM p_input->>'offer_key'
     OR v_instance.stripe_customer_id IS DISTINCT FROM p_input->>'customer_id' THEN
    RAISE EXCEPTION 'Fulfillment purchase attribution mismatch';
  END IF;
  IF v_instance.fulfillment_revision <> v_revision THEN
    RAISE EXCEPTION 'Purchase revision changed; refetch provider state' USING ERRCODE='40001';
  END IF;
  IF (v_instance.stripe_account_id IS NOT NULL AND v_instance.stripe_account_id <> v_account)
     OR (v_instance.stripe_livemode IS NOT NULL AND v_instance.stripe_livemode <> v_live)
     OR NOT EXISTS (SELECT 1 FROM public.stripe_customer_accounts c
       WHERE c.person_id=v_person_id AND c.stripe_account_id=v_account
       AND c.livemode=v_live AND c.stripe_customer_id=v_instance.stripe_customer_id) THEN
    RAISE EXCEPTION 'Fulfillment account or customer mapping mismatch';
  END IF;
  IF v_instance.status NOT IN ('pending','active','canceled','ended') THEN
    RAISE EXCEPTION 'Unknown purchase state';
  END IF;
  IF v_instance.status='ended' THEN v_state := 'ended'; END IF;
  v_sub := coalesce(nullif(v_ids->>'stripe_subscription_id',''),v_instance.stripe_subscription_id);
  v_payment := coalesce(nullif(v_ids->>'stripe_payment_intent_id',''),v_instance.stripe_payment_intent_id);
  IF (v_instance.stripe_subscription_id IS NOT NULL AND v_sub IS DISTINCT FROM v_instance.stripe_subscription_id)
     OR (v_instance.stripe_payment_intent_id IS NOT NULL AND v_payment IS DISTINCT FROM v_instance.stripe_payment_intent_id)
     OR v_source IS DISTINCT FROM coalesce(v_sub,v_payment,v_instance.stripe_checkout_session_id) THEN
    RAISE EXCEPTION 'Fulfillment provider reference mismatch';
  END IF;
  v_now := clock_timestamp();
  IF v_event.processing_lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'Fulfillment lease expired while waiting' USING ERRCODE='40001';
  END IF;

  IF v_state='active' THEN
    IF jsonb_array_length(v_mappings)=0 THEN RAISE EXCEPTION 'No entitlement mappings'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_mappings) m
      GROUP BY m->>'entitlement_key' HAVING count(*)>1) THEN
      RAISE EXCEPTION 'Duplicate entitlement mappings';
    END IF;
    FOR v_mapping IN SELECT value FROM jsonb_array_elements(v_mappings) ORDER BY value->>'entitlement_key' LOOP
      v_key := v_mapping->>'entitlement_key';
      v_days := (v_mapping->>'duration_days')::integer;
      IF v_key IS NULL OR v_key='' OR v_key <> lower(btrim(v_key))
         OR (v_days IS NOT NULL AND v_days < 0) THEN RAISE EXCEPTION 'Invalid entitlement mapping'; END IF;
      SELECT count(*) INTO v_count FROM public.person_entitlements
        WHERE person_id=v_person_id AND entitlement_key=v_key AND source='stripe' AND source_ref=v_source;
      IF v_count>1 THEN RAISE EXCEPTION 'Ambiguous existing source grant'; END IF;
      SELECT * INTO v_grant FROM public.person_entitlements
        WHERE person_id=v_person_id AND entitlement_key=v_key AND source='stripe' AND source_ref=v_source FOR UPDATE;
      IF FOUND THEN
        IF v_grant.ends_at IS NULL OR v_grant.ends_at>v_now THEN
          UPDATE public.person_entitlements SET is_active=true,updated_at=v_now WHERE id=v_grant.id;
        END IF;
      ELSE
        INSERT INTO public.person_entitlements
          (person_id,entitlement_key,is_active,starts_at,ends_at,source,source_ref,note)
        VALUES (v_person_id,v_key,true,v_now,
          CASE WHEN v_days>0 THEN v_now + make_interval(days=>v_days) ELSE NULL END,
          'stripe',v_source,'Granted via Stripe checkout for offer: ' || v_instance.offer_key);
      END IF;
    END LOOP;

    SELECT nullif(btrim(assigns_program_slug),'') INTO v_slug FROM public.offers
      WHERE offer_key=v_instance.offer_key FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase offer missing'; END IF;
    IF v_slug IS NOT NULL AND EXISTS (SELECT 1 FROM public.person_entitlements
      WHERE person_id=v_person_id AND source='stripe' AND source_ref=v_source
        AND is_active AND starts_at<=v_now AND (ends_at IS NULL OR ends_at>v_now))
      AND NOT EXISTS (SELECT 1 FROM public.person_entitlements
        WHERE person_id=v_person_id AND source='stripe' AND source_ref=v_source
          AND entitlement_key='program:' || v_slug AND ends_at<=v_now) THEN
      SELECT * INTO v_program FROM public.program_assignments
        WHERE person_id=v_person_id AND program_slug=v_slug AND source_ref=v_source FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.program_assignments
          (person_id,program_slug,acquisition_source,status,priority,source_ref,notes,auto_created)
        VALUES (v_person_id,v_slug,'purchase','active',0,v_source,
          'Auto-created from Stripe checkout for offer ' || v_instance.offer_key || '.',true);
      ELSIF v_program.auto_created AND v_program.acquisition_source='purchase'
         AND v_program.status='inactive'
         AND (v_program.active_to IS NULL OR v_program.active_to>v_now)
         AND EXISTS (SELECT 1 FROM public.stripe_program_suspensions
           WHERE assignment_id=v_program.id AND instance_id=v_instance_id) THEN
        UPDATE public.program_assignments SET status='active',updated_at=v_now WHERE id=v_program.id;
        DELETE FROM public.stripe_program_suspensions WHERE assignment_id=v_program.id AND instance_id=v_instance_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.person_entitlements SET is_active=false,updated_at=v_now
      WHERE person_id=v_person_id AND source='stripe' AND source_ref=v_source AND is_active;
    FOR v_program IN SELECT * FROM public.program_assignments
      WHERE person_id=v_person_id AND source_ref=v_source AND auto_created
        AND acquisition_source='purchase' AND status='active' FOR UPDATE LOOP
      INSERT INTO public.stripe_program_suspensions(assignment_id,instance_id)
        VALUES(v_program.id,v_instance_id) ON CONFLICT (assignment_id) DO NOTHING;
      UPDATE public.program_assignments SET status='inactive',updated_at=v_now WHERE id=v_program.id;
    END LOOP;
  END IF;

  UPDATE public.stripe_offer_instances SET status=v_state,stripe_subscription_id=v_sub,
    stripe_payment_intent_id=v_payment,stripe_account_id=v_account,stripe_livemode=v_live,updated_at=v_now
    WHERE id=v_instance_id RETURNING fulfillment_revision INTO v_new_revision;

  IF v_checkout IS NOT NULL AND v_checkout <> 'null'::jsonb THEN
    IF v_state<>'active' OR jsonb_typeof(v_checkout)<>'object'
      OR v_checkout->>'stripe_checkout_session_id' IS DISTINCT FROM v_instance.stripe_checkout_session_id THEN
      RAISE EXCEPTION 'Checkout completion record mismatch';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.checkout_events
      WHERE event_type='checkout_completed' AND stripe_checkout_session_id=v_instance.stripe_checkout_session_id) THEN
      INSERT INTO public.checkout_events(event_type,person_id,offer_key,placement,source,session_id,
        utm_source,utm_medium,utm_campaign,utm_content,utm_term,
        stripe_checkout_session_id,stripe_subscription_id,stripe_payment_intent_id)
      VALUES ('checkout_completed',v_person_id,v_instance.offer_key,
        v_checkout->>'placement',v_checkout->>'source',v_checkout->>'session_id',
        v_checkout->>'utm_source',v_checkout->>'utm_medium',v_checkout->>'utm_campaign',
        v_checkout->>'utm_content',v_checkout->>'utm_term',v_instance.stripe_checkout_session_id,v_sub,v_payment);
    END IF;
  END IF;

  -- A lease that expires DURING work must roll back every business write too.
  IF v_event.processing_lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Fulfillment lease expired before commit' USING ERRCODE='40001';
  END IF;
  UPDATE public.stripe_events SET processed_at=clock_timestamp(),processing_token=NULL,
    processing_lease_expires_at=NULL,fulfillment_instance_id=v_instance_id,
    fulfillment_account_id=v_account,fulfillment_livemode=v_live WHERE stripe_event_id=v_event_id;
  RETURN jsonb_build_object('status','committed','receipt_completed',true,
    'state',v_state,'revision',v_new_revision::text);
END;
$$;
REVOKE ALL ON FUNCTION public.fd_commit_stripe_fulfillment(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fd_commit_stripe_fulfillment(jsonb) TO service_role;
COMMENT ON FUNCTION public.fd_commit_stripe_fulfillment(jsonb) IS
 'Service-role only. Atomic purchase/access/program/checkout/receipt changes, fenced by event lease and pre-provider-read purchase revision.';
COMMIT;

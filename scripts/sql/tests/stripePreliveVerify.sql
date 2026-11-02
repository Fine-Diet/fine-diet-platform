-- Test the proposed migration twice for repeatability before applying any real migration.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.stripe_customer_accounts
   WHERE stripe_account_id='acct_1T1s86ARcbgSDadA' AND livemode=false;
  IF n <> 1 THEN RAISE EXCEPTION 'sandbox backfill failed: %', n; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.stripe_customer_accounts'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled';
  END IF;
  IF has_table_privilege('anon','public.stripe_customer_accounts','SELECT')
     OR has_table_privilege('authenticated','public.stripe_customer_accounts','SELECT') THEN
    RAISE EXCEPTION 'client role exposed to customer mapping';
  END IF;
  IF NOT has_table_privilege('service_role','public.stripe_customer_accounts','SELECT') THEN
    RAISE EXCEPTION 'service_role cannot read customer mapping';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='stripe_events'
      AND column_name='processing_lease_expires_at') THEN
    RAISE EXCEPTION 'webhook lease schema missing';
  END IF;
END $$;
-- Customer IDs from different accounts must coexist for one Fine Diet person.
INSERT INTO public.stripe_customer_accounts
  (person_id,stripe_account_id,livemode,stripe_customer_id)
VALUES ('00000000-0000-0000-0000-000000000001',
        'acct_1RCS7fPKrXgd7YWt',true,'cus_Live001');
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.stripe_customer_accounts
 WHERE person_id='00000000-0000-0000-0000-000000000001';
 IF n <> 2 THEN RAISE EXCEPTION 'sandbox and live customer identities did not coexist: %',n; END IF;
END $$;
-- Test the uniqueness rule; a second person cannot take the same customer ID.
DO $$
BEGIN
 BEGIN
   INSERT INTO public.stripe_customer_accounts(person_id,stripe_account_id,livemode,stripe_customer_id)
     VALUES ('00000000-0000-0000-0000-000000000002','acct_1RCS7fPKrXgd7YWt',true,'cus_Live001');
   RAISE EXCEPTION 'duplicate customer ID was incorrectly accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $$;
-- Verify existing stripe_events remains compatible with the lease column.
INSERT INTO public.stripe_events(stripe_event_id,type) VALUES ('evt_fixture','checkout.session.completed');
UPDATE public.stripe_events SET processing_token='test-token',
 processing_lease_expires_at=now() + interval '10 minutes' WHERE stripe_event_id='evt_fixture';
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.stripe_events
   WHERE stripe_event_id='evt_fixture' AND processing_token='test-token') THEN
   RAISE EXCEPTION 'event lease update failed';
 END IF;
END $$;

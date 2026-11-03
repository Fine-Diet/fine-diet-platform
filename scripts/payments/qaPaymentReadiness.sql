-- PAYMENTS QA READINESS (READ-ONLY)
-- Target: dedicated Supabase Payments QA project ikvkqpbwlpevqlshdkdz.
-- This intentionally does not compare the QA database with production counts.
-- It checks only the database objects used by hosted Checkout, webhook
-- fulfillment, renewals/cancellations, entitlement checks, and member program
-- content routes. It does not prove Vercel/Stripe configuration or user flows.
WITH required_relations(name) AS (
  VALUES
    ('public.people'),('public.profiles'),('public.offers'),
    ('public.price_options'),('public.offer_entitlements'),
    ('public.stripe_customers'),('public.stripe_customer_accounts'),
    ('public.stripe_offer_instances'),('public.stripe_events'),
    ('public.checkout_events'),('public.person_entitlements'),('public.subscriptions'),
    ('public.program_assignments'),('public.program_enrollments'),
    ('public.programs'),('public.program_versions'),
    ('public.program_modules'),('public.program_content_items'),
    ('public.program_content_progress'),('public.program_delivery_modules'),
    ('public.program_checkin_templates'),('public.program_checkin_responses'),
    ('public.program_recommendations')
),
present AS (
  SELECT name, to_regclass(name) IS NOT NULL AS exists_in_db
  FROM required_relations
),
required_columns(table_name, column_name) AS (
  VALUES
    ('people','id'),('people','auth_user_id'),('people','email'),('people','status'),
    ('profiles','id'),('profiles','role'),
    ('offers','offer_key'),('offers','is_active'),('offers','purchase_provider'),
    ('offers','billing_model'),('offers','stripe_price_id'),('offers','stripe_phase_price_ids'),
    ('offers','stripe_phase_iterations'),('offers','trial_period_days'),
    ('offers','success_path'),('offers','cancel_path'),('offers','assigns_program_slug'),
    ('price_options','price_option_key'),('price_options','offer_key'),
    ('price_options','is_active'),('price_options','billing_model'),('price_options','stripe_price_id'),
    ('price_options','stripe_phase_price_ids'),('price_options','intro_price_id'),
    ('price_options','intro_iterations'),('price_options','renewal_price_id'),('price_options','trial_period_days'),
    ('offer_entitlements','offer_key'),('offer_entitlements','entitlement_key'),
    ('offer_entitlements','duration_days'),('offer_entitlements','is_active'),
    ('stripe_customers','person_id'),('stripe_customers','stripe_customer_id'),
    ('stripe_customer_accounts','person_id'),('stripe_customer_accounts','stripe_account_id'),
    ('stripe_customer_accounts','livemode'),('stripe_customer_accounts','stripe_customer_id'),
    ('stripe_offer_instances','id'),('stripe_offer_instances','person_id'),
    ('stripe_offer_instances','offer_key'),('stripe_offer_instances','price_option_key'),
    ('stripe_offer_instances','stripe_customer_id'),('stripe_offer_instances','stripe_checkout_session_id'),
    ('stripe_offer_instances','stripe_subscription_id'),('stripe_offer_instances','status'),
    ('stripe_offer_instances','stripe_payment_intent_id'),('stripe_offer_instances','updated_at'),
    ('stripe_offer_instances','fulfillment_revision'),('stripe_offer_instances','stripe_account_id'),
    ('stripe_offer_instances','stripe_livemode'),
    ('stripe_events','stripe_event_id'),('stripe_events','type'),('stripe_events','created_at'),
    ('stripe_events','processed_at'),('stripe_events','payload'),
    ('stripe_events','processing_token'),('stripe_events','processing_lease_expires_at'),
    ('stripe_events','fulfillment_instance_id'),('stripe_events','fulfillment_account_id'),
    ('stripe_events','fulfillment_livemode'),
    ('checkout_events','event_type'),('checkout_events','person_id'),('checkout_events','offer_key'),
    ('checkout_events','placement'),('checkout_events','source'),('checkout_events','session_id'),
    ('checkout_events','utm_source'),('checkout_events','utm_medium'),('checkout_events','utm_campaign'),
    ('checkout_events','utm_content'),('checkout_events','utm_term'),
    ('checkout_events','referrer'),('checkout_events','user_agent'),
    ('checkout_events','stripe_checkout_session_id'),('checkout_events','stripe_subscription_id'),
    ('checkout_events','stripe_payment_intent_id'),
    ('person_entitlements','person_id'),('person_entitlements','entitlement_key'),
    ('person_entitlements','is_active'),('person_entitlements','starts_at'),
    ('person_entitlements','ends_at'),('person_entitlements','source'),('person_entitlements','source_ref'),
    ('subscriptions','id'),('subscriptions','person_id'),
    ('subscriptions','subscription_type'),('subscriptions','is_active'),
    ('program_assignments','person_id'),('program_assignments','program_slug'),
    ('program_assignments','status'),('program_assignments','source_ref'),('program_assignments','auto_created'),
    ('program_enrollments','person_id'),('program_enrollments','program_slug'),
    ('program_enrollments','program_version_id'),('program_enrollments','status'),
    ('programs','id'),('programs','slug'),('programs','title'),('programs','tagline'),
    ('programs','description'),('programs','storefront_href'),('programs','status'),
    ('program_versions','id'),('program_versions','program_id'),
    ('program_versions','version_key'),('program_versions','status'),
    ('program_modules','id'),('program_modules','program_id'),('program_modules','title'),
    ('program_modules','description'),('program_modules','ordinal'),('program_modules','status'),
    ('program_content_items','id'),('program_content_items','module_id'),
    ('program_content_items','item_type'),('program_content_items','title'),('program_content_items','summary'),
    ('program_content_items','body'),('program_content_items','video_url'),
    ('program_content_items','video_provider'),('program_content_items','estimated_minutes'),
    ('program_content_items','ordinal'),('program_content_items','status'),
    ('program_content_progress','id'),('program_content_progress','person_id'),
    ('program_content_progress','program_slug'),('program_content_progress','content_item_id'),
    ('program_content_progress','status'),('program_content_progress','started_at'),
    ('program_content_progress','completed_at'),('program_content_progress','last_viewed_at'),
    ('program_content_progress','progress_percent'),('program_content_progress','notes'),
    ('program_delivery_modules','id'),('program_delivery_modules','program_id'),
    ('program_delivery_modules','program_version_id'),('program_delivery_modules','module_key'),
    ('program_delivery_modules','module_type'),('program_delivery_modules','title'),
    ('program_delivery_modules','eyebrow'),('program_delivery_modules','body'),
    ('program_delivery_modules','day_start'),('program_delivery_modules','day_end'),
    ('program_delivery_modules','status_visibility'),('program_delivery_modules','capacity_variants_json'),
    ('program_delivery_modules','cta_json'),('program_delivery_modules','anchor_json'),
    ('program_delivery_modules','display_order'),('program_delivery_modules','status'),
    ('program_delivery_modules','safety_notes'),('program_delivery_modules','no_claims_notes'),
    ('program_delivery_modules','metadata'),
    ('program_checkin_templates','program_version_id'),('program_checkin_templates','status'),
    ('program_checkin_responses','enrollment_id'),('program_recommendations','enrollment_id')
),
missing_columns AS (
  SELECT format('public.%s.%s', c.table_name, c.column_name) AS name
  FROM required_columns c
  JOIN required_relations r ON r.name = 'public.' || c.table_name
  WHERE to_regclass(r.name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema='public' AND ic.table_name=c.table_name
        AND ic.column_name=c.column_name
    )
),
payment_tables AS (
  SELECT unnest(ARRAY[
    'stripe_customers','stripe_customer_accounts','stripe_offer_instances',
    'stripe_events','checkout_events','person_entitlements','offer_entitlements',
    'program_assignments','program_enrollments','subscriptions','program_content_progress'
  ]) AS table_name
),
table_security AS (
  SELECT
    (SELECT count(*)=23 FROM present r JOIN pg_class c ON c.oid=to_regclass(r.name)
      WHERE r.exists_in_db AND c.relrowsecurity) AS all_required_tables_have_rls,
    count(*) FILTER (WHERE c.relrowsecurity) = count(*) AS all_rls_enabled,
    bool_and(
      has_table_privilege('service_role', format('public.%I', p.table_name), 'SELECT')
      AND has_table_privilege('service_role', format('public.%I', p.table_name), 'INSERT')
      AND has_table_privilege('service_role', format('public.%I', p.table_name), 'UPDATE')
      AND has_table_privilege('service_role', format('public.%I', p.table_name), 'DELETE')
    ) AS service_role_write_access,
    bool_and(NOT has_table_privilege('anon', format('public.%I', p.table_name), 'SELECT')) AS anon_cannot_read_payment_tables,
    bool_and(
      NOT has_table_privilege('authenticated', format('public.%I', p.table_name), 'SELECT')
      OR NOT EXISTS (
        SELECT 1 FROM pg_policies policy
        WHERE policy.schemaname='public' AND policy.tablename=p.table_name
          AND policy.cmd IN ('SELECT','ALL')
          AND (policy.roles @> ARRAY['authenticated'::name]
            OR policy.roles @> ARRAY['public'::name])
          AND (policy.qual IS NULL OR lower(btrim(policy.qual)) IN ('true','(true)'))
      )
    ) AS authenticated_reads_are_policy_scoped
  FROM payment_tables p
  JOIN pg_class c ON c.oid=to_regclass(format('public.%I', p.table_name))
),
catalog AS (
  SELECT
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.is_active AND o.purchase_provider='stripe'
        AND o.billing_model='subscription'
        AND o.stripe_price_id ~ '^price_[A-Za-z0-9]+$'
        AND EXISTS (
          SELECT 1 FROM public.offer_entitlements e
          WHERE e.offer_key=o.offer_key AND e.is_active
        )
    ) AS active_subscription_offer_ready,
    EXISTS (
      SELECT 1 FROM public.people p
      JOIN auth.users u ON u.id=p.auth_user_id
    ) AS authenticated_qa_member_linked,
    EXISTS (
      SELECT 1 FROM public.stripe_customer_accounts c
      WHERE c.stripe_account_id ~ '^acct_[A-Za-z0-9]+$' AND NOT c.livemode
    ) AS test_mode_customer_mapping_present
),
functions AS (
  SELECT
    to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)') IS NOT NULL AS atomic_fulfillment_rpc_present,
    to_regprocedure('public.fd_stripe_bump_fulfillment_revision()') IS NOT NULL AS revision_trigger_function_present,
    COALESCE((SELECT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_proc p
      WHERE p.oid=to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)')),false) AS service_role_can_fulfill,
    COALESCE((SELECT NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p
      WHERE p.oid=to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)')),true) AS anon_cannot_fulfill,
    COALESCE((SELECT NOT has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_proc p
      WHERE p.oid=to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)')),true) AS authenticated_cannot_fulfill
),
trigger_state AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid=to_regclass('public.stripe_offer_instances')
      AND tgname='fd_stripe_fulfillment_revision' AND NOT tgisinternal
  ) AS fulfillment_revision_trigger_present
),
summary AS (
  SELECT
    (SELECT count(*)=23 FROM present WHERE exists_in_db) AS required_relations_present,
    NOT EXISTS (SELECT 1 FROM missing_columns) AS required_columns_present,
    (SELECT all_required_tables_have_rls AND all_rls_enabled AND service_role_write_access
       AND anon_cannot_read_payment_tables AND authenticated_reads_are_policy_scoped
     FROM table_security) AS payment_table_security_ready,
    (SELECT atomic_fulfillment_rpc_present AND revision_trigger_function_present
       AND service_role_can_fulfill AND anon_cannot_fulfill AND authenticated_cannot_fulfill
     FROM functions) AS fulfillment_rpc_security_ready,
    (SELECT fulfillment_revision_trigger_present FROM trigger_state) AS revision_trigger_ready,
    (SELECT active_subscription_offer_ready FROM catalog) AS checkout_catalog_ready,
    (SELECT authenticated_qa_member_linked FROM catalog) AS qa_member_auth_link_ready,
    (SELECT test_mode_customer_mapping_present FROM catalog) AS sandbox_customer_mapping_ready
)
SELECT jsonb_build_object(
  'payment_readiness', CASE WHEN
    required_relations_present AND required_columns_present AND payment_table_security_ready
    AND fulfillment_rpc_security_ready AND revision_trigger_ready AND checkout_catalog_ready
    AND qa_member_auth_link_ready AND sandbox_customer_mapping_ready
    THEN 'PASS_PAYMENT_SCHEMA_GATE' ELSE 'NO_GO' END,
  'required_relations_present', required_relations_present,
  'missing_relations', (SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM present WHERE NOT exists_in_db),
  'required_columns_present', required_columns_present,
  'missing_columns', (SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM missing_columns),
  'payment_table_security_ready', payment_table_security_ready,
  'fulfillment_rpc_security_ready', fulfillment_rpc_security_ready,
  'revision_trigger_ready', revision_trigger_ready,
  'checkout_catalog_ready', checkout_catalog_ready,
  'qa_member_auth_link_ready', qa_member_auth_link_ready,
  'sandbox_customer_mapping_ready', sandbox_customer_mapping_ready,
  'public_table_count_informational_only', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
  'production_schema_parity_evaluated', false,
  'hosted_vercel_and_stripe_isolation_required', true
) AS payment_qa_readiness
FROM summary;

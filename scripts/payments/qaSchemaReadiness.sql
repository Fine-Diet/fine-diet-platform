-- PAYMENT QA BASELINE READINESS (READ-ONLY)
-- Always target Supabase project ikvkqpbwlpevqlshdkdz.
-- This is a structural minimum, NOT proof of full schema parity or paid access.
-- Production counts measured read-only on 2026-11-01: 117 public tables,
-- 2 public views, 92 public functions, 117 RLS tables, 245 public policies,
-- and the programs_private schema.
-- Run on QA after a reviewed schema-only restore, and before live sandbox events.
WITH required(name) AS (
  VALUES
    ('public.people'),('public.profiles'),('public.offers'),
    ('public.price_options'),('public.offer_entitlements'),
    ('public.stripe_customers'),('public.stripe_offer_instances'),
    ('public.stripe_events'),('public.checkout_events'),
    ('public.person_entitlements'),('public.program_assignments'),
    ('public.program_enrollments')
),
present AS (
  SELECT name, to_regclass(name) IS NOT NULL AS exists_in_db FROM required
),
stats AS (
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('v','m')) AS views,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public') AS functions,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relrowsecurity) AS rls_tables,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
    (SELECT count(*) FROM auth.users) AS auth_users
),
stage AS (
  SELECT
    (SELECT count(*)=12 FROM present WHERE exists_in_db) AS required_tables_present,
    (SELECT tables>=117 AND views>=2 AND functions>=92
       AND rls_tables=tables AND policies>=245 FROM stats) AS public_schema_minimum,
    EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='programs_private') AS private_programs_schema,
    to_regclass('public.stripe_customer_accounts') IS NOT NULL AS scoped_customers,
    to_regclass('public.stripe_program_suspensions') IS NOT NULL AS scoped_programs,
    to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)') IS NOT NULL AS atomic_fulfillment
)
SELECT jsonb_build_object(
  'baseline_status', CASE
    WHEN required_tables_present AND public_schema_minimum AND private_programs_schema
    THEN 'PASS_MINIMUM_CATALOG_CHECK' ELSE 'NO_GO' END,
  'payment_candidate_status', CASE
    WHEN required_tables_present AND public_schema_minimum AND private_programs_schema
      AND scoped_customers AND scoped_programs AND atomic_fulfillment
    THEN 'CANDIDATE_OBJECTS_PRESENT' ELSE 'NO_GO' END,
  'missing_core_tables', (SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb)
                          FROM present WHERE NOT exists_in_db),
  'public_tables', stats.tables,
  'public_views', stats.views,
  'public_functions', stats.functions,
  'public_rls_tables', stats.rls_tables,
  'public_policies', stats.policies,
  'programs_private_schema', stage.private_programs_schema,
  'stripe_customer_accounts', stage.scoped_customers,
  'stripe_program_suspensions', stage.scoped_programs,
  'atomic_fulfillment_rpc', stage.atomic_fulfillment,
  'auth_user_count', stats.auth_users
) AS qa_readiness
FROM stats CROSS JOIN stage;

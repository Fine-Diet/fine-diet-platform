-- Scoped Payments QA schema for project ikvkqpbwlpevqlshdkdz only.
-- This is the minimum catalog the checkout, webhook, entitlement, and program
-- routes read and write. It is not a production clone and not a CI fixture.
-- The script aborts on a populated database. It creates no customer rows.

DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users) > 0 THEN
    RAISE EXCEPTION 'refusing database that already has auth users';
  END IF;
  IF (SELECT count(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r') > 0 THEN
    RAISE EXCEPTION 'refusing database that already has public tables';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.update_journal_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  status text NOT NULL DEFAULT 'active_user',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT people_email_unique_plain UNIQUE (email),
  CONSTRAINT people_status_check CHECK (status = ANY (ARRAY[
    'marketing_only','waitlist','active_user','inactive_user','unsubscribed','blocked'
  ]))
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY[
    'user','editor','admin','staff','coach'
  ]))
);

CREATE TABLE public.offers (
  offer_key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  purchase_provider text,
  billing_model text NOT NULL DEFAULT 'one_time',
  stripe_price_id text,
  stripe_phase_price_ids text[],
  stripe_phase_iterations integer[],
  success_path text,
  cancel_path text,
  assigns_program_slug text,
  trial_period_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT offers_billing_model_check CHECK (billing_model = ANY (ARRAY[
    'one_time','subscription','installment'
  ]))
);

CREATE TABLE public.price_options (
  price_option_key text PRIMARY KEY,
  offer_key text NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  billing_model text NOT NULL DEFAULT 'subscription',
  stripe_price_id text,
  stripe_phase_price_ids text[],
  stripe_phase_iterations integer[],
  intro_price_id text,
  intro_iterations integer,
  renewal_price_id text,
  trial_period_days integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT price_options_billing_model_check CHECK (billing_model = ANY (ARRAY[
    'one_time','subscription','installment','intro_then_subscription'
  ])),
  CONSTRAINT price_options_intro_iterations_check CHECK (intro_iterations IS NULL OR intro_iterations > 0),
  CONSTRAINT price_options_trial_period_days_check CHECK (trial_period_days IS NULL OR trial_period_days >= 0)
);

CREATE TABLE public.offer_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_key text NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  duration_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT offer_entitlements_duration_check CHECK (duration_days IS NULL OR duration_days > 0)
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  subscription_type text NOT NULL,
  program_slug text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT subscriptions_person_type_program_unique UNIQUE (person_id, subscription_type, program_slug),
  CONSTRAINT subscriptions_type_check CHECK (subscription_type = ANY (ARRAY[
    'email_marketing','product_updates','program_waitlist','journal_access'
  ]))
);

CREATE TABLE public.stripe_customers (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload jsonb
);

CREATE TABLE public.stripe_offer_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  offer_key text NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  price_option_key text,
  stripe_customer_id text NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_offer_instances_status_check CHECK (status = ANY (ARRAY[
    'pending','active','ended','canceled'
  ]))
);

CREATE TABLE public.checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  offer_key text,
  placement text,
  source text,
  session_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  user_agent text,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'checkout_started','checkout_completed','checkout_failed'
  ]))
);

CREATE TABLE public.person_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT person_entitlements_time_window_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  tagline text,
  description text,
  storefront_href text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programs_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT programs_status_check CHECK (status = ANY (ARRAY['draft','published','archived']))
);

CREATE TABLE public.program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  version_key text NOT NULL,
  version_label text,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  duration_days integer,
  default_unlock_day integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_versions_program_key_unique UNIQUE (program_id, version_key),
  CONSTRAINT program_versions_program_number_unique UNIQUE (program_id, version_number),
  CONSTRAINT program_versions_status_check CHECK (status = ANY (ARRAY['draft','published','archived'])),
  CONSTRAINT program_versions_duration_days_check CHECK (duration_days IS NULL OR duration_days >= 1),
  CONSTRAINT program_versions_default_unlock_day_check CHECK (default_unlock_day >= 1),
  CONSTRAINT program_versions_version_key_check CHECK (version_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  CONSTRAINT program_versions_version_number_check CHECK (version_number >= 1)
);

CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_slug text NOT NULL,
  acquisition_source text NOT NULL DEFAULT 'admin_grant',
  status text NOT NULL DEFAULT 'active',
  active_from timestamptz,
  active_to timestamptz,
  priority integer NOT NULL DEFAULT 0,
  source_ref text,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_created boolean NOT NULL DEFAULT false,
  CONSTRAINT program_assignments_acquisition_source_check CHECK (acquisition_source = ANY (ARRAY[
    'offer','purchase','admin_grant','bundle','other'
  ])),
  CONSTRAINT program_assignments_status_check CHECK (status = ANY (ARRAY[
    'active','inactive','scheduled','completed','cancelled'
  ])),
  CONSTRAINT program_assignments_active_window_check CHECK (
    active_to IS NULL OR active_from IS NULL OR active_to > active_from
  )
);

CREATE TABLE public.program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  program_slug text NOT NULL,
  program_version_id uuid NOT NULL REFERENCES public.program_versions(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_ref text,
  entitlement_key text,
  assignment_id uuid REFERENCES public.program_assignments(id) ON DELETE SET NULL,
  purchase_date date,
  selected_start_date date NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pre_start',
  timezone text NOT NULL DEFAULT 'UTC',
  current_capacity text NOT NULL DEFAULT 'steady',
  paused_days_total integer NOT NULL DEFAULT 0,
  pause_until date,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_enrollments_program_slug_check CHECK (program_slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT program_enrollments_source_type_check CHECK (source_type = ANY (ARRAY[
    'entitlement','assignment','admin_grant'
  ])),
  CONSTRAINT program_enrollments_assignment_source_check CHECK (
    (source_type = 'assignment' AND assignment_id IS NOT NULL) OR source_type <> 'assignment'
  ),
  CONSTRAINT program_enrollments_status_check CHECK (status = ANY (ARRAY[
    'pre_start','active','paused','completed','cancelled'
  ])),
  CONSTRAINT program_enrollments_completed_status_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed'
  ),
  CONSTRAINT program_enrollments_current_capacity_check CHECK (current_capacity = ANY (ARRAY[
    'low','steady','high'
  ])),
  CONSTRAINT program_enrollments_paused_days_total_check CHECK (paused_days_total >= 0)
);

CREATE TABLE public.program_checkin_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_version_id uuid NOT NULL REFERENCES public.program_versions(id) ON DELETE CASCADE,
  checkin_day integer NOT NULL,
  title text NOT NULL,
  description text,
  prompt_md text,
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_checkin_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  checkin_template_id uuid,
  checkin_day integer NOT NULL,
  response_status text NOT NULL,
  response_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  skipped_reason text,
  responded_at timestamptz,
  skipped_at timestamptz,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  based_on_checkin_response_id uuid,
  recommendation_type text NOT NULL DEFAULT 'runtime_summary',
  program_day integer,
  status text NOT NULL DEFAULT 'generated',
  recommendation_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON public.stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_stripe_offer_instances_updated_at
  BEFORE UPDATE ON public.stripe_offer_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_person_entitlements_updated_at
  BEFORE UPDATE ON public.person_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER program_assignments_updated_at
  BEFORE UPDATE ON public.program_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_journal_updated_at();

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_offer_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_recommendations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.profiles, public.people, public.offers, public.price_options,
  public.offer_entitlements, public.person_entitlements, public.programs,
  public.program_versions, public.program_assignments, public.program_enrollments
  TO authenticated;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY people_select_own ON public.people
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY offers_select_active ON public.offers
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY price_options_select_active ON public.price_options
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY offer_entitlements_select_active ON public.offer_entitlements
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY person_entitlements_select_own ON public.person_entitlements
  FOR SELECT TO authenticated USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY programs_select_published ON public.programs
  FOR SELECT TO authenticated USING (status = 'published');
CREATE POLICY program_versions_select_published ON public.program_versions
  FOR SELECT TO authenticated USING (status = 'published');
CREATE POLICY program_assignments_select_own ON public.program_assignments
  FOR SELECT TO authenticated USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY program_enrollments_select_own ON public.program_enrollments
  FOR SELECT TO authenticated USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- Synthetic catalog only. No person, auth identity, or Stripe customer is inserted here.
INSERT INTO public.programs (slug, title, tagline, status)
VALUES ('qa-payments', 'QA Payments Program', 'Synthetic program for hosted payment QA', 'published');

INSERT INTO public.program_versions (
  program_id, version_key, version_label, version_number, status, duration_days, published_at
)
SELECT id, 'v1', 'QA v1', 1, 'published', 14, now()
FROM public.programs WHERE slug = 'qa-payments';

INSERT INTO public.offers (
  offer_key, name, description, is_active, purchase_provider, billing_model,
  assigns_program_slug, success_path, cancel_path
) VALUES (
  'qa-payments-monthly',
  'QA Payments Monthly',
  'Synthetic monthly subscription used only on the payments QA branch.',
  true, 'stripe', 'subscription', 'qa-payments', '/onboarding', '/start'
);

INSERT INTO public.price_options (
  price_option_key, offer_key, name, is_active, billing_model, sort_order
) VALUES (
  'qa-payments-monthly', 'qa-payments-monthly', 'Monthly', true, 'subscription', 0
);

INSERT INTO public.offer_entitlements (offer_key, entitlement_key, duration_days, is_active)
VALUES
  ('qa-payments-monthly', 'journal', NULL, true),
  ('qa-payments-monthly', 'program:qa-payments', NULL, true);

-- Extends stripePreliveFixture.sql in a disposable database only.
-- Mirrors the relevant production columns/constraints inspected read-only.
CREATE TABLE public.offers (
  offer_key text PRIMARY KEY, assigns_program_slug text, billing_model text NOT NULL DEFAULT 'subscription'
);
CREATE TABLE public.price_options (
  price_option_key text PRIMARY KEY, offer_key text NOT NULL REFERENCES public.offers(offer_key),
  billing_model text NOT NULL DEFAULT 'subscription'
);
CREATE TABLE public.stripe_offer_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES public.people(id),
  offer_key text NOT NULL REFERENCES public.offers(offer_key), stripe_customer_id text NOT NULL,
  stripe_checkout_session_id text UNIQUE, stripe_subscription_id text, stripe_payment_intent_id text,
  price_option_key text, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','canceled','ended')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.person_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES public.people(id),
  entitlement_key text NOT NULL,is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz,
  source text NOT NULL DEFAULT 'manual',source_ref text,note text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at>starts_at)
);
CREATE UNIQUE INDEX idx_person_entitlements_active_unique
 ON public.person_entitlements(person_id,entitlement_key) WHERE is_active AND ends_at IS NULL;
CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),person_id uuid NOT NULL REFERENCES public.people(id),
  program_slug text NOT NULL,acquisition_source text NOT NULL DEFAULT 'admin_grant'
   CHECK(acquisition_source IN ('offer','purchase','admin_grant','bundle','other')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','scheduled','completed','cancelled')),
  active_from timestamptz,active_to timestamptz,priority integer NOT NULL DEFAULT 0,
  source_ref text,notes text,created_by_user_id uuid,auto_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(active_to IS NULL OR active_from IS NULL OR active_to>active_from)
);
CREATE UNIQUE INDEX idx_program_assignments_provenance_unique
 ON public.program_assignments(person_id,program_slug,source_ref) WHERE source_ref IS NOT NULL;
CREATE TABLE public.checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_type text NOT NULL,person_id uuid,offer_key text,
  placement text,source text,session_id text,utm_source text,utm_medium text,utm_campaign text,
  utm_content text,utm_term text,stripe_checkout_session_id text,stripe_subscription_id text,
  stripe_payment_intent_id text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_offer_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offers,public.stripe_offer_instances,public.person_entitlements,
 public.program_assignments,public.checkout_events,public.stripe_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.price_options FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.offers,public.stripe_offer_instances,public.person_entitlements,
 public.program_assignments,public.checkout_events,public.stripe_events TO service_role;
GRANT SELECT ON public.price_options TO service_role;

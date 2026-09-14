-- G1 application fixture schema. Applied only to a run-owned local cluster
-- after GoTrue has created the real auth schema. Not a remote/production apply.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;

-- Application people columns required by link-person / middleware.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS primary_source TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS last_source TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS email_marketing_opt_in BOOLEAN;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS email_opt_in_at TIMESTAMPTZ;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_marketing_opt_in BOOLEAN;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_consent_source TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_consent_text TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS sms_consent_version TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS metadata JSONB;

UPDATE public.people SET email = 'fixture-' || id::text || '@local.invalid' WHERE email IS NULL;
UPDATE public.people SET status = 'active_user' WHERE status IS NULL;
UPDATE public.people SET email_marketing_opt_in = true WHERE email_marketing_opt_in IS NULL;
UPDATE public.people SET sms_marketing_opt_in = false WHERE sms_marketing_opt_in IS NULL;
UPDATE public.people SET metadata = '{}'::jsonb WHERE metadata IS NULL;

ALTER TABLE public.people ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.people ALTER COLUMN status SET DEFAULT 'active_user';
ALTER TABLE public.people ALTER COLUMN email_marketing_opt_in SET DEFAULT true;
ALTER TABLE public.people ALTER COLUMN sms_marketing_opt_in SET DEFAULT false;
ALTER TABLE public.people ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_email_key'
  ) THEN
    ALTER TABLE public.people ADD CONSTRAINT people_email_key UNIQUE (email);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_email_lower ON public.people (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_people_auth_user_id ON public.people (auth_user_id);

DROP POLICY IF EXISTS "Service role can manage people" ON public.people;
CREATE POLICY "Service role can manage people"
  ON public.people FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO service_role;
GRANT SELECT ON public.people TO authenticated;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;
CREATE POLICY "Service role can manage profiles"
  ON public.profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role, authenticated;

CREATE TABLE IF NOT EXISTS public.people_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source TEXT,
  channel TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.people_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage people_events" ON public.people_events;
CREATE POLICY "Service role can manage people_events"
  ON public.people_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.people_events TO service_role;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL,
  program_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.person_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage person_entitlements" ON public.person_entitlements;
CREATE POLICY "Service role can manage person_entitlements"
  ON public.person_entitlements FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_entitlements TO service_role;
GRANT SELECT ON public.person_entitlements TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, authenticated, anon;

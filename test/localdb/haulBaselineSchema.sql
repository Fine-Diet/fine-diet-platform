-- ============================================================================
-- Invite to Haul v1 local fixture: upstream baseline for the Haul schema
-- ============================================================================
--
-- Reproduces ONLY the upstream objects that the repository's Haul SQL files
-- depend on, so those real files can be applied, in operator order, to a
-- disposable local PostgreSQL server and the invitation spine rehearsed under
-- real constraints, triggers, RLS and role grants.
--
-- Assembled from the repository's own SQL/type history, NOT read from any remote
-- database. Only columns the Haul DDL/RPCs actually touch are reproduced. This is
-- a fixture for behaviour, not a claim to mirror production byte for byte.
-- ============================================================================

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

-- Supabase grants ALL on every new public table/function/sequence to the three
-- API roles by default. That default is exactly why the repository's Haul SQL
-- issues explicit REVOKEs, so the fixture reproduces it: a migration that forgot
-- a REVOKE would fail here instead of silently passing.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auth.uid() reads a session GUC so a test can impersonate a signed-in subject.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- fine_diet_prod_schema.sql: public.people (identity columns only).
CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL DEFAULT 'marketing_only',
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS people_email_lower_unique
  ON public.people (lower(email));

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS people_select_self ON public.people;
CREATE POLICY people_select_self ON public.people
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
GRANT SELECT ON public.people TO authenticated;

CREATE TABLE IF NOT EXISTS public.food_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.generated_grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  grocery_list_id UUID NOT NULL REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pantry_on_hand_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE
);

-- Referenced by the Haul foundation's updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

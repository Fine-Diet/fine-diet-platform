\set ON_ERROR_STOP on
-- Hosted-safe target-branch setup. This file never creates/modifies Supabase
-- roles, auth schema/tables, or JWT functions. Run only on an approved, isolated,
-- zero-data branch after the runner has verified its project identity.
BEGIN;
DO $preflight$
DECLARE
  missing text[];
  existing text[];
BEGIN
  SELECT array_agg(required_name ORDER BY required_name) INTO missing
  FROM unnest(ARRAY['anon','authenticated','service_role']) required_name
  WHERE to_regrole(required_name) IS NULL;
  IF cardinality(missing)>0 THEN
    RAISE EXCEPTION 'Supabase-managed roles missing: %',array_to_string(missing,', ');
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL THEN
    RAISE EXCEPTION 'Supabase-managed Auth schema/functions are unavailable; setup will not create them';
  END IF;
  SELECT array_agg(object_name ORDER BY object_name) INTO existing
  FROM unnest(ARRAY['people','profiles','programs','program_modules','program_content_items',
    'program_delivery_modules','person_entitlements','program_assignments','program_versions','program_enrollments']) object_name
  WHERE to_regclass(format('public.%I',object_name)) IS NOT NULL;
  IF cardinality(existing)>0 OR to_regnamespace('programs_private') IS NOT NULL
     OR to_regprocedure('public.current_user_role()') IS NOT NULL THEN
    RAISE EXCEPTION 'Target branch is not schema-clean for the scoped fixture; existing objects: %',
      COALESCE(array_to_string(existing,', '),'programs_private/current_user_role');
  END IF;
END;
$preflight$;
CREATE SCHEMA programs_private;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
CREATE TABLE public.people (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'marketing_only'
    CHECK (status IN ('marketing_only','waitlist','active_user','inactive_user','unsubscribed','blocked'))
);
CREATE INDEX people_auth_user_id_idx ON public.people(auth_user_id);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
-- Production has RLS enabled and no permissive people policy.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text,
  updated_at timestamptz
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_read_own_profile ON public.profiles FOR SELECT TO PUBLIC
  USING (auth.uid() = id);
CREATE POLICY service_role_read_all_profiles ON public.profiles FOR SELECT TO PUBLIC
  USING (auth.role() = 'service_role');
CREATE POLICY service_role_insert_profiles ON public.profiles FOR INSERT TO PUBLIC
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_role_update_profiles ON public.profiles FOR UPDATE TO PUBLIC
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated, service_role;

CREATE TABLE public.programs (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))
);
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.program_modules (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ordinal integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_program_modules_program_ord ON public.program_modules(program_id, ordinal);
CREATE INDEX idx_program_modules_status ON public.program_modules(status);
ALTER TABLE public.program_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_content_items (
  id uuid PRIMARY KEY,
  module_id uuid NOT NULL REFERENCES public.program_modules(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('article','guidance','video','milestone')),
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ordinal integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_program_content_items_module_ord ON public.program_content_items(module_id, ordinal);
CREATE INDEX idx_program_content_items_status ON public.program_content_items(status);
ALTER TABLE public.program_content_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.person_entitlements (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  source text NOT NULL DEFAULT 'stripe'
    CHECK (source IN ('admin_grant','manual','offer','stripe','migration')),
  source_ref text,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_person_entitlements_lookup ON public.person_entitlements(person_id, entitlement_key, is_active);
CREATE UNIQUE INDEX idx_person_entitlements_active_unique ON public.person_entitlements(person_id, entitlement_key)
  WHERE is_active AND ends_at IS NULL;
ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_slug text NOT NULL,
  acquisition_source text NOT NULL DEFAULT 'purchase'
    CHECK (acquisition_source IN ('offer','purchase','admin_grant','bundle','other')),
  source_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','scheduled','completed','cancelled')),
  active_from timestamptz,
  active_to timestamptz,
  CHECK (active_to IS NULL OR active_from IS NULL OR active_to > active_from)
);
CREATE INDEX idx_program_assignments_person_slug_status ON public.program_assignments(person_id, program_slug, status);
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_versions (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  version_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  duration_days integer CHECK (duration_days IS NULL OR duration_days >= 1),
  UNIQUE (program_id, version_key)
);
ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_enrollments (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  program_version_id uuid NOT NULL REFERENCES public.program_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pre_start' CHECK (status IN ('pre_start','active','paused','completed','cancelled')),
  selected_start_date date NOT NULL,
  completed_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  paused_days_total integer NOT NULL DEFAULT 0 CHECK (paused_days_total >= 0),
  metadata jsonb NOT NULL DEFAULT '{}',
  CHECK (status = 'completed' AND completed_at IS NOT NULL OR status <> 'completed')
);
CREATE INDEX idx_program_enrollments_version ON public.program_enrollments(program_version_id);
CREATE INDEX idx_program_enrollments_person_status ON public.program_enrollments(person_id, status);
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_delivery_modules (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  program_version_id uuid REFERENCES public.program_versions(id) ON DELETE SET NULL,
  module_key text NOT NULL,
  module_type text NOT NULL CHECK (module_type IN ('prep','week','practice_card','guide','capacity_support','roadmap','checkin_prompt','recommendation_prompt')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  status_visibility text[] NOT NULL DEFAULT ARRAY['pre_start','active']::text[]
    CHECK (status_visibility <@ ARRAY['not_started','pre_start','active','paused','completed','cancelled']::text[]),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  day_start integer CHECK (day_start IS NULL OR day_start >= 0),
  day_end integer CHECK (day_end IS NULL OR day_end >= 0),
  CHECK (day_start IS NULL OR day_end IS NULL OR day_start <= day_end),
  CHECK (module_key ~ '^[a-z0-9][a-z0-9_-]*$')
);
CREATE UNIQUE INDEX idx_program_delivery_modules_key ON public.program_delivery_modules
  (program_id,COALESCE(program_version_id,'00000000-0000-0000-0000-000000000000'::uuid),module_key);
CREATE INDEX idx_program_delivery_modules_program_order ON public.program_delivery_modules(program_id,program_version_id,display_order);
CREATE INDEX idx_program_delivery_modules_status ON public.program_delivery_modules(status);
ALTER TABLE public.program_delivery_modules ENABLE ROW LEVEL SECURITY;

-- Production private identity resolver: SECURITY DEFINER, fixed empty search
-- path, auth.uid()-scoped, authenticated EXECUTE only.
CREATE FUNCTION programs_private.current_person_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.people AS p WHERE p.auth_user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION programs_private.current_person_ids() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION programs_private.current_person_ids() TO authenticated;

CREATE FUNCTION programs_private.paused_historical_day(
  selected_start_date date, time_zone text, pause_started_at text,
  paused_days_total integer, duration_days integer
) RETURNS integer
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  zone text;
  today date;
  pause_date date;
  paused_day integer;
  actual_day integer;
  duration_cap integer;
  ceiling integer;
BEGIN
  zone := COALESCE(NULLIF(time_zone, ''), 'UTC');
  BEGIN
    today := (pg_catalog.timezone(zone, pg_catalog.now()))::pg_catalog.date;
  EXCEPTION WHEN invalid_parameter_value THEN
    zone := 'UTC';
    today := (pg_catalog.timezone('UTC', pg_catalog.now()))::pg_catalog.date;
  END;
  IF pause_started_at IS NULL OR pause_started_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN 0; END IF;
  BEGIN
    pause_date := pause_started_at::pg_catalog.date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RETURN 0;
  END;
  IF pg_catalog.to_char(pause_date, 'YYYY-MM-DD') IS DISTINCT FROM pause_started_at THEN RETURN 0; END IF;
  IF pause_date > today OR selected_start_date IS NULL THEN RETURN 0; END IF;
  paused_day := (pause_date - selected_start_date) + 1 - COALESCE(paused_days_total, 0);
  IF paused_day IS NULL OR paused_day < 0 THEN paused_day := 0; END IF;
  actual_day := (today - selected_start_date) + 1 - COALESCE(paused_days_total, 0);
  IF actual_day IS NULL OR actual_day < 0 THEN actual_day := 0; END IF;
  duration_cap := COALESCE(duration_days, 2147483647);
  ceiling := paused_day;
  IF actual_day < ceiling THEN ceiling := actual_day; END IF;
  IF duration_cap < ceiling THEN ceiling := duration_cap; END IF;
  IF ceiling < 0 THEN RETURN 0; END IF;
  RETURN ceiling;
END
$$;
REVOKE ALL ON FUNCTION programs_private.paused_historical_day(date,text,text,integer,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION programs_private.paused_historical_day(date,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.current_user_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'user')
$$;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO PUBLIC;

-- Exact policy boundary from Production pg_policies. The publication policies
-- on modules/items are intentionally PUBLIC before the candidate migration.
CREATE POLICY "Authenticated can read published programs" ON public.programs
  FOR SELECT TO PUBLIC USING (status = 'published');
CREATE POLICY "Authenticated can read published program_modules" ON public.program_modules
  FOR SELECT TO PUBLIC USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = program_modules.program_id AND p.status = 'published'
  ));
CREATE POLICY "Authenticated can read published program_content_items" ON public.program_content_items
  FOR SELECT TO PUBLIC USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.program_modules m JOIN public.programs p ON p.id = m.program_id
    WHERE m.id = program_content_items.module_id AND m.status = 'published' AND p.status = 'published'
  ));
CREATE POLICY "Users can read own program_assignments" ON public.program_assignments
  FOR SELECT TO PUBLIC USING (person_id IN (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()));
CREATE POLICY "Users can read own program_enrollments" ON public.program_enrollments
  FOR SELECT TO authenticated USING (person_id IN (SELECT programs_private.current_person_ids()));
CREATE POLICY "Users can read own enrolled published program_versions" ON public.program_versions
  FOR SELECT TO authenticated USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.program_enrollments e JOIN public.programs p ON p.id=e.program_id
    WHERE e.program_version_id=program_versions.id AND e.program_id=program_versions.program_id
      AND e.person_id IN (SELECT programs_private.current_person_ids())
      AND e.status <> 'cancelled' AND p.status='published'
  ));
CREATE POLICY "Users can read own entitlements" ON public.person_entitlements
  FOR SELECT TO authenticated USING (person_id IN (
    SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
  ));
CREATE POLICY "Admin/editor can read all entitlements" ON public.person_entitlements
  FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','editor']::text[]));
CREATE POLICY "Admin/editor can insert entitlements" ON public.person_entitlements
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','editor']::text[]));
CREATE POLICY "Admin/editor can update entitlements" ON public.person_entitlements
  FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','editor']::text[]))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','editor']::text[]));
CREATE POLICY "Admin/editor can delete entitlements" ON public.person_entitlements
  FOR DELETE TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','editor']::text[]));
CREATE POLICY "Service role can manage person_entitlements" ON public.person_entitlements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can administer program_enrollments" ON public.program_enrollments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can administer program_versions" ON public.program_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Production delivery policy, including identity, matching program/version,
-- publication, enrollment status, status_visibility and current/historical day.
CREATE POLICY "Members can read enrolled available program_delivery_modules"
ON public.program_delivery_modules FOR SELECT TO authenticated USING (
  status = 'published' AND EXISTS (
    SELECT 1 FROM public.program_enrollments e
    JOIN public.programs p ON p.id=e.program_id
    JOIN public.program_versions pv ON pv.id=e.program_version_id
    WHERE e.person_id IN (SELECT programs_private.current_person_ids())
      AND e.program_id=program_delivery_modules.program_id
      AND e.program_version_id=program_delivery_modules.program_version_id
      AND pv.program_id=e.program_id
      AND e.status <> 'cancelled' AND p.status='published' AND pv.status='published'
      AND program_delivery_modules.program_version_id IS NOT NULL
      AND program_delivery_modules.status_visibility @> ARRAY[
        CASE
          WHEN e.status='completed' OR e.completed_at IS NOT NULL THEN 'completed'
          WHEN e.status='paused' THEN 'paused'
          WHEN e.status='pre_start' THEN 'pre_start'
          WHEN ((timezone(COALESCE(NULLIF(e.timezone,''),'UTC'),now()))::date-e.selected_start_date+1-COALESCE(e.paused_days_total,0)) <= 0 THEN 'pre_start'
          ELSE 'active'
        END
      ]
      AND CASE
        WHEN e.status='completed' OR e.completed_at IS NOT NULL OR e.status='paused' THEN
          program_delivery_modules.day_start IS NOT NULL
          AND program_delivery_modules.day_end IS NOT NULL
          AND program_delivery_modules.day_start >= 0
          AND program_delivery_modules.day_end >= program_delivery_modules.day_start
          AND program_delivery_modules.module_type = ANY(ARRAY['prep','week','practice_card','guide','capacity_support','roadmap']::text[])
          AND program_delivery_modules.day_start <= CASE
            WHEN e.status='completed' OR e.completed_at IS NOT NULL THEN
              LEAST(COALESCE(pv.duration_days,2147483647),GREATEST(0,
                COALESCE((timezone(COALESCE(NULLIF(e.timezone,''),'UTC'),e.completed_at))::date-e.selected_start_date+1-COALESCE(e.paused_days_total,0),
                (timezone(COALESCE(NULLIF(e.timezone,''),'UTC'),now()))::date-e.selected_start_date+1-COALESCE(e.paused_days_total,0))))
            ELSE programs_private.paused_historical_day(e.selected_start_date,e.timezone,
              (e.metadata->>'pause_started_at'),e.paused_days_total,pv.duration_days)
          END
        ELSE
          program_delivery_modules.day_start IS NULL OR program_delivery_modules.day_start <= CASE
            WHEN e.status='pre_start' THEN 0
            ELSE GREATEST(0,(timezone(COALESCE(NULLIF(e.timezone,''),'UTC'),now()))::date-e.selected_start_date+1-COALESCE(e.paused_days_total,0))
          END
      END
  )
);

-- Reproduce Production's grants before applying the candidate. These broad
-- grants make the migration's revocation assertions meaningful.
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON
  public.people, public.programs, public.program_modules, public.program_content_items,
  public.person_entitlements, public.program_assignments
TO anon, authenticated, service_role;
GRANT SELECT ON public.program_delivery_modules, public.program_versions, public.program_enrollments
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON
  public.program_delivery_modules, public.program_versions, public.program_enrollments
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people, public.person_entitlements,
  public.program_assignments, public.programs, public.program_modules, public.program_content_items,
  public.program_delivery_modules, public.program_versions, public.program_enrollments
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people, public.person_entitlements, public.program_assignments
TO authenticated;
GRANT SELECT ON public.programs TO anon;


COMMIT;

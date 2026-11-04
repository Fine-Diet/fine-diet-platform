\set ON_ERROR_STOP on

-- Targeted authorization fixture for PR #225, reconstructed from read-only
-- Production pg_catalog metadata on 2026-11-04. This is not a full schema dump.
-- It contains only the nine policy-relevant public tables, referenced Auth /
-- profile helpers, policy definitions, and synthetic rows needed to exercise
-- the candidate migration. No Production rows or historical migrations used.

CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA auth;
CREATE SCHEMA programs_private;
CREATE SCHEMA test;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

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

CREATE FUNCTION test.assert_count(label text, actual bigint, expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual <> expected THEN RAISE EXCEPTION '%: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %: %', label, actual;
END
$$;
GRANT EXECUTE ON FUNCTION test.assert_count(text,bigint,bigint) TO anon, authenticated, service_role;
CREATE FUNCTION test.assert_select_denied(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE ignored bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s',target) INTO ignored;
  RAISE EXCEPTION 'expected SELECT denial for %',target;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS SELECT denied: %',target;
END
$$;
GRANT EXECUTE ON FUNCTION test.assert_select_denied(regclass) TO anon, authenticated, service_role;

-- Synthetic-only identities and content.
INSERT INTO auth.users VALUES
 ('40000000-0000-4000-8000-000000000401','member-a@example.invalid'),
 ('40000000-0000-4000-8000-000000000402','member-b@example.invalid'),
 ('40000000-0000-4000-8000-000000000403','admin@example.invalid');
INSERT INTO public.people(id,email,auth_user_id,status) VALUES
 ('30000000-0000-4000-8000-000000000301','member-a@example.invalid','40000000-0000-4000-8000-000000000401','active_user'),
 ('30000000-0000-4000-8000-000000000302','member-b@example.invalid','40000000-0000-4000-8000-000000000402','active_user'),
 ('30000000-0000-4000-8000-000000000303','admin@example.invalid','40000000-0000-4000-8000-000000000403','active_user');
INSERT INTO public.profiles(id,role) VALUES
 ('40000000-0000-4000-8000-000000000401','user'),
 ('40000000-0000-4000-8000-000000000402','user'),
 ('40000000-0000-4000-8000-000000000403','admin');
INSERT INTO public.programs VALUES
 ('10000000-0000-4000-8000-000000000101','guided','published'),
 ('10000000-0000-4000-8000-000000000102','other','published'),
 ('10000000-0000-4000-8000-000000000103','unpublished','draft');
INSERT INTO public.program_modules VALUES
 ('50000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000101','published',1),
 ('50000000-0000-4000-8000-000000000502','10000000-0000-4000-8000-000000000102','published',1),
 ('50000000-0000-4000-8000-000000000503','10000000-0000-4000-8000-000000000101','draft',2),
 ('50000000-0000-4000-8000-000000000504','10000000-0000-4000-8000-000000000103','published',1);
INSERT INTO public.program_content_items VALUES
 ('60000000-0000-4000-8000-000000000601','50000000-0000-4000-8000-000000000501','article','Guided article','member curriculum','published',1),
 ('60000000-0000-4000-8000-000000000602','50000000-0000-4000-8000-000000000502','article','Other article','other curriculum','published',1),
 ('60000000-0000-4000-8000-000000000603','50000000-0000-4000-8000-000000000501','article','Draft article','draft curriculum','draft',2),
 ('60000000-0000-4000-8000-000000000604','50000000-0000-4000-8000-000000000504','article','Unpublished article','unpublished curriculum','published',1);
INSERT INTO public.program_versions VALUES
 ('20000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000101','v1','published',14),
 ('20000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000102','v1','published',14),
 ('20000000-0000-4000-8000-000000000203','10000000-0000-4000-8000-000000000103','v1','draft',14),
 ('20000000-0000-4000-8000-000000000204','10000000-0000-4000-8000-000000000101','v2-draft','draft',14);
INSERT INTO public.program_enrollments VALUES
 ('80000000-0000-4000-8000-000000000801','30000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','active',(timezone('UTC',now()))::date-2,NULL,'UTC',0,'{}'),
 ('80000000-0000-4000-8000-000000000802','30000000-0000-4000-8000-000000000302','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','active',(timezone('UTC',now()))::date-2,NULL,'UTC',0,'{}');
INSERT INTO public.program_delivery_modules
  (id,program_id,program_version_id,module_key,module_type,status,status_visibility,display_order,day_start,day_end) VALUES
 ('70000000-0000-4000-8000-000000000701','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','active-day','week','published',ARRAY['active','paused','completed'],0,1,14),
 ('70000000-0000-4000-8000-000000000702','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','future-day','week','published',ARRAY['active','paused','completed'],0,4,5),
 ('70000000-0000-4000-8000-000000000703','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','pre-start','prep','published',ARRAY['pre_start'],0,0,0),
 ('70000000-0000-4000-8000-000000000704','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','future-prep','prep','published',ARRAY['pre_start'],0,1,1),
 ('70000000-0000-4000-8000-000000000709','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','mismatched-version','week','published',ARRAY['active'],0,1,3),
 ('70000000-0000-4000-8000-000000000710','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','wrong-visible-state','week','published',ARRAY['pre_start'],0,1,3),
 ('70000000-0000-4000-8000-000000000711','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000204','draft-version','week','published',ARRAY['active'],0,1,3);
INSERT INTO public.person_entitlements VALUES
 ('90000000-0000-4000-8000-000000000901','30000000-0000-4000-8000-000000000301','program:guided',true,now()-interval '1 day',NULL);

-- Apply PR #225's source migration unchanged against this exact-policy fixture.
\ir ../../../supabase/migrations/20261103090000_program_content_entitlement_rls.sql

SELECT test.assert_count('anon modules SELECT grant removed',has_table_privilege('anon','public.program_modules','SELECT')::int,0);
SELECT test.assert_count('anon content-item SELECT grant removed',has_table_privilege('anon','public.program_content_items','SELECT')::int,0);
SELECT test.assert_count('anon delivery SELECT absent',has_table_privilege('anon','public.program_delivery_modules','SELECT')::int,0);
SELECT test.assert_count('authenticated curriculum SELECT retained',has_table_privilege('authenticated','public.program_modules','SELECT')::int,1);
SELECT test.assert_count('authenticated curriculum INSERT removed',has_table_privilege('authenticated','public.program_modules','INSERT')::int,0);
SELECT test.assert_count('service role curriculum CRUD retained',has_table_privilege('service_role','public.program_content_items','INSERT')::int,1);
SELECT test.assert_count('candidate helper denied to anon',has_function_privilege('anon','programs_private.current_user_has_program_access(uuid)','EXECUTE')::int,0);
SELECT test.assert_count('candidate helper available to authenticated',has_function_privilege('authenticated','programs_private.current_user_has_program_access(uuid)','EXECUTE')::int,1);
SELECT test.assert_count('candidate helper denied to service_role',has_function_privilege('service_role','programs_private.current_user_has_program_access(uuid)','EXECUTE')::int,0);
SELECT test.assert_count('identity helper denied to anon',has_function_privilege('anon','programs_private.current_person_ids()','EXECUTE')::int,0);
SELECT test.assert_count('identity helper available to authenticated',has_function_privilege('authenticated','programs_private.current_person_ids()','EXECUTE')::int,1);
SELECT test.assert_count('identity helper denied to service_role',has_function_privilege('service_role','programs_private.current_person_ids()','EXECUTE')::int,0);
SELECT test.assert_count('private schema usage limited to authenticated',(
  has_schema_privilege('anon','programs_private','USAGE')::int+
  has_schema_privilege('authenticated','programs_private','USAGE')::int+
  has_schema_privilege('service_role','programs_private','USAGE')::int),1);

-- Public catalog metadata stays public; direct curriculum becomes private.
SET ROLE anon;
SELECT test.assert_count('anon published program catalogue metadata',count(*),2) FROM public.programs;
SELECT test.assert_select_denied('public.program_modules');
SELECT test.assert_select_denied('public.program_content_items');
RESET ROLE;

-- Enrollment alone and another person's entitlement do not authorize access.
SET request.jwt.claim.sub='40000000-0000-4000-8000-000000000402';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
SELECT test.assert_count('no-entitlement member curriculum denied despite enrollment',count(*),0) FROM public.program_modules;
SELECT test.assert_count('no-entitlement member delivery denied despite own enrollment',count(*),0) FROM public.program_delivery_modules;
SELECT test.assert_count('own enrollment metadata remains available after access loss',count(*),1)
  FROM public.program_enrollments WHERE id='80000000-0000-4000-8000-000000000802';
SELECT test.assert_count('own published version metadata remains available after access loss',count(*),1)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000201';
SELECT test.assert_count('wrong-person entitlement does not authorize',count(*),0)
  FROM public.program_modules WHERE id='50000000-0000-4000-8000-000000000501';
RESET ROLE;

-- Valid member sees published own-program content only; draft stays hidden.
SET request.jwt.claim.sub='40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
SELECT test.assert_count('valid entitlement published own module',count(*),1) FROM public.program_modules;
SELECT test.assert_count('valid entitlement wrong program denied',count(*),0)
  FROM public.program_modules WHERE id='50000000-0000-4000-8000-000000000502';
SELECT test.assert_count('valid entitlement draft module denied',count(*),0)
  FROM public.program_modules WHERE id='50000000-0000-4000-8000-000000000503';
SELECT test.assert_count('valid entitlement own content item',count(*),1) FROM public.program_content_items;
SELECT test.assert_count('valid entitlement draft content item denied',count(*),0)
  FROM public.program_content_items WHERE id='60000000-0000-4000-8000-000000000603';
SELECT test.assert_count('own published program version remains readable',count(*),1)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000201';
SELECT test.assert_count('wrong-program version metadata denied',count(*),0)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000202';
SELECT test.assert_count('active delivery day visible',count(*),1)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000701';
SELECT test.assert_count('future active day hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000702';
RESET ROLE;
UPDATE public.program_enrollments SET status='pre_start',
  selected_start_date=(timezone('UTC',now()))::date+2
WHERE id='80000000-0000-4000-8000-000000000801';
SET ROLE authenticated;
SELECT test.assert_count('pre-start configured day visible',count(*),1)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000703';
SELECT test.assert_count('pre-start later day hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000704';
SELECT test.assert_count('program and version mismatch hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000709';
SELECT test.assert_count('delivery hidden when current state is not visible',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000710';
SELECT test.assert_count('draft program version delivery hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000711';
RESET ROLE;
UPDATE public.program_enrollments SET status='active',
  selected_start_date=(timezone('UTC',now()))::date-2
WHERE id='80000000-0000-4000-8000-000000000801';

-- Journal-only, expired, future and revoked program entitlements fail closed.
INSERT INTO public.person_entitlements VALUES
 ('90000000-0000-4000-8000-000000000902','30000000-0000-4000-8000-000000000301','journal',true,now()-interval '1 day',NULL);
UPDATE public.person_entitlements SET is_active=false WHERE id='90000000-0000-4000-8000-000000000901';
SET ROLE authenticated;
SELECT test.assert_count('journal-only entitlement denied',count(*),0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET is_active=true,ends_at=now()-interval '1 second' WHERE id='90000000-0000-4000-8000-000000000901';
SET ROLE authenticated;
SELECT test.assert_count('expired entitlement denied',count(*),0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET ends_at=NULL,starts_at=now()+interval '1 day' WHERE id='90000000-0000-4000-8000-000000000901';
SET ROLE authenticated;
SELECT test.assert_count('future entitlement denied',count(*),0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET starts_at=now()-interval '1 day',is_active=false WHERE id='90000000-0000-4000-8000-000000000901';
SET ROLE authenticated;
SELECT test.assert_count('revoked entitlement denied',count(*),0) FROM public.program_modules;
RESET ROLE;

-- A current assignment authorizes program content but not delivery without its
-- own enrollment/visibility conditions. Future/expired/cancelled assignments fail.
INSERT INTO public.program_assignments VALUES
 ('a0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000302','guided','active',now()-interval '1 day',NULL),
 ('a0000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000302','guided','active',now()+interval '1 day',NULL),
 ('a0000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000302','guided','active',now()-interval '2 days',now()-interval '1 day');
SET request.jwt.claim.sub='40000000-0000-4000-8000-000000000402';
SET ROLE authenticated;
SELECT test.assert_count('current assignment authorizes module',count(*),1) FROM public.program_modules;
SELECT test.assert_count('current assignment does not widen program scope',count(*),0)
  FROM public.program_modules WHERE id='50000000-0000-4000-8000-000000000502';
SELECT test.assert_count('assignment plus own active visible enrollment permits delivery',count(*),1)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000701';
RESET ROLE;
UPDATE public.program_assignments SET status='cancelled' WHERE id='a0000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT test.assert_count('cancelled assignment denied',count(*),0) FROM public.program_modules;
RESET ROLE;
UPDATE public.program_assignments SET status='active',active_from=now()+interval '1 day' WHERE id='a0000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT test.assert_count('future assignment denied',count(*),0) FROM public.program_modules;
RESET ROLE;
UPDATE public.program_assignments SET active_from=now()-interval '2 days' WHERE id='a0000000-0000-4000-8000-000000000003';
SET ROLE authenticated;
SELECT test.assert_count('expired assignment denied',count(*),0) FROM public.program_modules;
RESET ROLE;

-- Exact Production delivery behavior: paused and completed enrollment may read
-- historical days within their computed cutoff, not later authored days.
SET request.jwt.claim.sub='40000000-0000-4000-8000-000000000401';
UPDATE public.person_entitlements SET is_active=true,starts_at=now()-interval '1 day',ends_at=NULL WHERE id='90000000-0000-4000-8000-000000000901';
UPDATE public.program_enrollments SET status='paused',selected_start_date=(timezone('UTC',now()))::date-10,
  paused_days_total=0,metadata=jsonb_build_object('pause_started_at',((timezone('UTC',now()))::date-3)::text)
WHERE id='80000000-0000-4000-8000-000000000801';
INSERT INTO public.program_delivery_modules
  (id,program_id,program_version_id,module_key,module_type,status,status_visibility,display_order,day_start,day_end) VALUES
 ('70000000-0000-4000-8000-000000000705','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','paused-historical','week','published',ARRAY['paused'],0,8,14),
 ('70000000-0000-4000-8000-000000000706','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','paused-future','week','published',ARRAY['paused'],0,9,14);
SET ROLE authenticated;
SELECT test.assert_count('paused historical day through cutoff visible',count(*),1)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000705';
SELECT test.assert_count('paused day beyond cutoff hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000706';
SELECT test.assert_count('paused enrollment historical version metadata retained',count(*),1)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000201';
RESET ROLE;

UPDATE public.program_versions SET duration_days=8 WHERE id='20000000-0000-4000-8000-000000000201';
UPDATE public.program_enrollments SET status='completed',completed_at=now()-interval '2 days',
  selected_start_date=(timezone('UTC',now()))::date-10,paused_days_total=0,metadata='{}'
WHERE id='80000000-0000-4000-8000-000000000801';
INSERT INTO public.program_delivery_modules
  (id,program_id,program_version_id,module_key,module_type,status,status_visibility,display_order,day_start,day_end) VALUES
 ('70000000-0000-4000-8000-000000000707','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','completed-historical','week','published',ARRAY['completed'],0,8,14),
 ('70000000-0000-4000-8000-000000000708','10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000201','completed-after-cutoff','week','published',ARRAY['completed'],0,9,14);
SET ROLE authenticated;
SELECT test.assert_count('completed historical day before duration cutoff visible',count(*),1)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000707';
SELECT test.assert_count('completed day beyond duration cutoff hidden',count(*),0)
  FROM public.program_delivery_modules WHERE id='70000000-0000-4000-8000-000000000708';
SELECT test.assert_count('completed enrollment historical version metadata retained',count(*),1)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000201';
RESET ROLE;

UPDATE public.program_enrollments SET status='cancelled',completed_at=NULL WHERE id='80000000-0000-4000-8000-000000000801';
SET ROLE authenticated;
SELECT test.assert_count('cancelled enrollment delivery denied',count(*),0) FROM public.program_delivery_modules;
SELECT test.assert_count('cancelled enrollment version metadata denied',count(*),0)
  FROM public.program_versions WHERE id='20000000-0000-4000-8000-000000000201';
RESET ROLE;

-- Service role retains intended server/admin CRUD and RLS bypass.
SET ROLE service_role;
SELECT test.assert_count('service role sees published and draft modules',count(*),4) FROM public.program_modules;
SELECT test.assert_count('service_role can SELECT every curriculum table',(
  has_table_privilege('service_role','public.program_modules','SELECT')::int+
  has_table_privilege('service_role','public.program_content_items','SELECT')::int+
  has_table_privilege('service_role','public.program_delivery_modules','SELECT')::int),3);
SELECT test.assert_count('service_role can INSERT every curriculum table',(
  has_table_privilege('service_role','public.program_modules','INSERT')::int+
  has_table_privilege('service_role','public.program_content_items','INSERT')::int+
  has_table_privilege('service_role','public.program_delivery_modules','INSERT')::int),3);
SELECT test.assert_count('service_role can UPDATE every curriculum table',(
  has_table_privilege('service_role','public.program_modules','UPDATE')::int+
  has_table_privilege('service_role','public.program_content_items','UPDATE')::int+
  has_table_privilege('service_role','public.program_delivery_modules','UPDATE')::int),3);
SELECT test.assert_count('service_role can DELETE every curriculum table',(
  has_table_privilege('service_role','public.program_modules','DELETE')::int+
  has_table_privilege('service_role','public.program_content_items','DELETE')::int+
  has_table_privilege('service_role','public.program_delivery_modules','DELETE')::int),3);
INSERT INTO public.program_modules VALUES ('b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000102','draft',9);
UPDATE public.program_modules SET status='published' WHERE id='b0000000-0000-4000-8000-000000000001';
DELETE FROM public.program_modules WHERE id='b0000000-0000-4000-8000-000000000001';
SELECT test.assert_count('service role CRUD leaves no test row',count(*),0)
  FROM public.program_modules WHERE id='b0000000-0000-4000-8000-000000000001';
INSERT INTO public.program_content_items VALUES
 ('b0000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000501','article','Admin item','synthetic','draft',99);
UPDATE public.program_content_items SET status='published' WHERE id='b0000000-0000-4000-8000-000000000002';
DELETE FROM public.program_content_items WHERE id='b0000000-0000-4000-8000-000000000002';
INSERT INTO public.program_delivery_modules
  (id,program_id,program_version_id,module_key,module_type,status,status_visibility,display_order,day_start,day_end) VALUES
 ('b0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000202','admin-test','guide','draft',ARRAY['active'],99,NULL,NULL);
UPDATE public.program_delivery_modules SET status='published' WHERE id='b0000000-0000-4000-8000-000000000003';
DELETE FROM public.program_delivery_modules WHERE id='b0000000-0000-4000-8000-000000000003';
SELECT test.assert_count('service role item and delivery CRUD leaves no test rows',(
 (SELECT count(*) FROM public.program_content_items WHERE id='b0000000-0000-4000-8000-000000000002')+
 (SELECT count(*) FROM public.program_delivery_modules WHERE id='b0000000-0000-4000-8000-000000000003')),0);
RESET ROLE;

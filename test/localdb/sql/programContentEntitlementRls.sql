\set ON_ERROR_STOP on

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT anon, authenticated, service_role TO CURRENT_USER;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE SCHEMA test;
CREATE FUNCTION test.assert_count(label text, actual bigint, expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual <> expected THEN
    RAISE EXCEPTION '%: expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS %: %', label, actual;
END
$$;
GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION test.assert_count(text, bigint, bigint)
  TO anon, authenticated, service_role;

CREATE TABLE public.people (id uuid PRIMARY KEY, auth_user_id uuid NOT NULL);
CREATE SCHEMA programs_private;
CREATE FUNCTION programs_private.current_person_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.people AS p WHERE p.auth_user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION programs_private.current_person_ids()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA programs_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
GRANT EXECUTE ON FUNCTION programs_private.current_person_ids() TO authenticated;

CREATE TABLE public.programs (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, status text NOT NULL);
CREATE TABLE public.program_modules (id uuid PRIMARY KEY, program_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.program_content_items (id uuid PRIMARY KEY, module_id uuid NOT NULL, status text NOT NULL, body text NOT NULL);
CREATE TABLE public.program_delivery_modules (
  id uuid PRIMARY KEY, program_id uuid NOT NULL, program_version_id uuid NOT NULL,
  status text NOT NULL, status_visibility text[] NOT NULL
);
CREATE TABLE public.person_entitlements (
  id uuid PRIMARY KEY, person_id uuid NOT NULL, entitlement_key text NOT NULL,
  is_active boolean NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz
);
CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY, person_id uuid NOT NULL, program_slug text NOT NULL,
  status text NOT NULL, active_from timestamptz, active_to timestamptz
);
CREATE TABLE public.program_versions (id uuid PRIMARY KEY, program_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.program_enrollments (
  id uuid PRIMARY KEY, person_id uuid NOT NULL, program_id uuid NOT NULL,
  program_version_id uuid NOT NULL, status text NOT NULL
);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_delivery_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_service_all ON public.people FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY entitlements_service_all ON public.person_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY assignments_service_all ON public.program_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY programs_published ON public.programs FOR SELECT TO public USING (status = 'published');
CREATE POLICY modules_published ON public.program_modules FOR SELECT TO public
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.status = 'published'
  ));
CREATE POLICY items_published ON public.program_content_items FOR SELECT TO public
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.program_modules m JOIN public.programs p ON p.id = m.program_id
    WHERE m.id = module_id AND m.status = 'published' AND p.status = 'published'
  ));
CREATE POLICY delivery_enrollment ON public.program_delivery_modules FOR SELECT TO authenticated
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.program_enrollments e
    JOIN public.program_versions v ON v.id = e.program_version_id
    JOIN public.programs p ON p.id = e.program_id
    WHERE e.person_id IN (SELECT programs_private.current_person_ids())
      AND e.program_id = program_delivery_modules.program_id
      AND e.program_version_id = program_delivery_modules.program_version_id
      AND e.status <> 'cancelled' AND v.status = 'published' AND p.status = 'published'
      AND program_delivery_modules.status_visibility @> ARRAY[e.status]
  ));
CREATE POLICY versions_published ON public.program_versions FOR SELECT TO authenticated USING (status = 'published');
CREATE POLICY enrollments_self ON public.program_enrollments FOR SELECT TO authenticated
  USING (person_id IN (SELECT programs_private.current_person_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.program_modules, public.program_content_items, public.program_delivery_modules
TO anon, authenticated, service_role;
GRANT SELECT ON public.people, public.programs, public.person_entitlements,
  public.program_assignments, public.program_versions, public.program_enrollments
TO authenticated, service_role;
GRANT SELECT ON public.programs TO anon;

INSERT INTO public.people VALUES
  ('30000000-0000-4000-8000-000000000301', '40000000-0000-4000-8000-000000000401'),
  ('30000000-0000-4000-8000-000000000302', '40000000-0000-4000-8000-000000000402');
INSERT INTO public.programs VALUES
  ('10000000-0000-4000-8000-000000000101', 'guided', 'published'),
  ('10000000-0000-4000-8000-000000000102', 'other', 'published');
INSERT INTO public.program_versions VALUES
  ('20000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000101', 'published');
INSERT INTO public.program_modules VALUES
  ('50000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000101', 'published'),
  ('50000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000102', 'published');
INSERT INTO public.program_content_items VALUES
  ('60000000-0000-4000-8000-000000000601', '50000000-0000-4000-8000-000000000501', 'published', 'member curriculum'),
  ('60000000-0000-4000-8000-000000000602', '50000000-0000-4000-8000-000000000502', 'published', 'other curriculum');
INSERT INTO public.program_delivery_modules VALUES
  ('70000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000201', 'published', ARRAY['active','paused','completed']);
INSERT INTO public.program_enrollments VALUES
  ('80000000-0000-4000-8000-000000000801', '30000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000201', 'active');
INSERT INTO public.person_entitlements VALUES
  ('90000000-0000-4000-8000-000000000901', '30000000-0000-4000-8000-000000000301', 'program:guided', true, now() - interval '1 day', NULL);

\ir ../../../supabase/migrations/20261103090000_program_content_entitlement_rls.sql

SELECT test.assert_count('anon SELECT grant removed', has_table_privilege('anon', 'public.program_modules', 'SELECT')::int, 0);
SELECT test.assert_count('authenticated SELECT retained', has_table_privilege('authenticated', 'public.program_modules', 'SELECT')::int, 1);
SELECT test.assert_count('authenticated INSERT removed', has_table_privilege('authenticated', 'public.program_modules', 'INSERT')::int, 0);
SELECT test.assert_count('service_role SELECT retained', has_table_privilege('service_role', 'public.program_modules', 'SELECT')::int, 1);
SELECT test.assert_count('service_role INSERT retained', has_table_privilege('service_role', 'public.program_modules', 'INSERT')::int, 1);
SELECT test.assert_count('helper not callable by anon', has_function_privilege('anon', 'programs_private.current_user_has_program_access(uuid)', 'EXECUTE')::int, 0);

SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000402';
SET ROLE authenticated;
SELECT test.assert_count('unentitled member modules', count(*), 0) FROM public.program_modules;
SELECT test.assert_count('unentitled member content items', count(*), 0) FROM public.program_content_items;
RESET ROLE;

SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
SELECT test.assert_count('entitled member own module', count(*), 1) FROM public.program_modules;
SELECT test.assert_count('entitled member wrong program denied', count(*), 0)
FROM public.program_modules WHERE id = '50000000-0000-4000-8000-000000000502';
SELECT test.assert_count('entitled member own item', count(*), 1) FROM public.program_content_items;
SELECT test.assert_count('entitled member enrolled delivery module', count(*), 1) FROM public.program_delivery_modules;
RESET ROLE;

-- A journal-only grant is not a program entitlement.
INSERT INTO public.person_entitlements VALUES
  ('90000000-0000-4000-8000-000000000902', '30000000-0000-4000-8000-000000000301', 'journal', true, now() - interval '1 day', NULL);
UPDATE public.person_entitlements SET is_active = false
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';
SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
SELECT test.assert_count('journal-only entitlement denied', count(*), 0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET is_active = true
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';

-- Expired, future, and revoked entitlement records do not authorize access.
UPDATE public.person_entitlements SET ends_at = now() - interval '1 second'
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';
SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
SELECT test.assert_count('expired entitlement denied', count(*), 0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET ends_at = NULL, starts_at = now() + interval '1 day'
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';
SET ROLE authenticated;
SELECT test.assert_count('future entitlement denied', count(*), 0) FROM public.program_modules;
RESET ROLE;
UPDATE public.person_entitlements SET starts_at = now() - interval '1 day', is_active = false
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';
SET ROLE authenticated;
SELECT test.assert_count('revoked entitlement denied', count(*), 0) FROM public.program_modules;
RESET ROLE;

-- Explicit active in-window assignments remain an authorized no-purchase path.
INSERT INTO public.program_assignments VALUES
  ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000302', 'guided', 'active', now() - interval '1 day', NULL),
  ('a0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000302', 'guided', 'active', now() + interval '1 day', NULL),
  ('a0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000302', 'active-only', 'active', now() - interval '1 day', NULL),
  ('a0000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000302', 'guided', 'active', now() - interval '2 days', now() - interval '1 day');
SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000402';
SET ROLE authenticated;
SELECT test.assert_count('active assignment authorizes curriculum', count(*), 1) FROM public.program_modules;
SELECT test.assert_count('assignment is scoped to its named program', count(*), 1)
FROM public.program_modules WHERE id = '50000000-0000-4000-8000-000000000501';
SELECT test.assert_count('assignment cannot read another program', count(*), 0)
FROM public.program_modules WHERE id = '50000000-0000-4000-8000-000000000502';
RESET ROLE;
UPDATE public.program_assignments SET status = 'cancelled'
WHERE id = 'a0000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT test.assert_count('cancelled assignment denied', count(*), 0) FROM public.program_modules;
RESET ROLE;

-- The existing delivery permissive policy continues to enforce enrollment
-- status visibility on top of the new access gate.
UPDATE public.person_entitlements SET is_active = true, starts_at = now() - interval '1 day', ends_at = NULL
WHERE entitlement_key = 'program:guided' AND person_id = '30000000-0000-4000-8000-000000000301';
SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
SELECT test.assert_count('active delivery visible', count(*), 1) FROM public.program_delivery_modules;
RESET ROLE;
UPDATE public.program_enrollments SET status = 'paused';
SET ROLE authenticated;
SELECT test.assert_count('paused delivery visible when configured', count(*), 1) FROM public.program_delivery_modules;
RESET ROLE;
UPDATE public.program_enrollments SET status = 'cancelled';
SET ROLE authenticated;
SELECT test.assert_count('cancelled enrollment delivery denied', count(*), 0) FROM public.program_delivery_modules;
RESET ROLE;
UPDATE public.program_enrollments SET status = 'completed';
SET ROLE authenticated;
SELECT test.assert_count('completed delivery visible when configured', count(*), 1) FROM public.program_delivery_modules;
RESET ROLE;

SET ROLE service_role;
SELECT test.assert_count('service role sees all modules', count(*), 2) FROM public.program_modules;
UPDATE public.program_modules SET status = 'draft'
WHERE id = '50000000-0000-4000-8000-000000000501';
INSERT INTO public.program_modules VALUES
  ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000102', 'draft');
DELETE FROM public.program_modules
WHERE id = 'b0000000-0000-4000-8000-000000000001';
RESET ROLE;

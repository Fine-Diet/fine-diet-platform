\set ON_ERROR_STOP on

-- Runs only after the success regression, in a second session on the same
-- disposable cluster. Restores the vulnerable grants, plants one extra
-- permissive SELECT, and records the state the failed migration must preserve.
\if :{?negative_plant}
CREATE POLICY "Users can insert own program_content_progress"
  ON public.program_content_progress
  FOR INSERT
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own program_content_progress"
  ON public.program_content_progress
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
GRANT INSERT, UPDATE ON TABLE public.program_content_progress TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.program_content_progress TO PUBLIC;
GRANT UPDATE ON TABLE public.program_content_progress TO anon;
GRANT TRUNCATE ON TABLE public.program_content_progress TO authenticated;
GRANT DELETE ON TABLE public.program_content_progress TO anon;
GRANT UPDATE (notes) ON TABLE public.program_content_progress TO authenticated;
CREATE POLICY "progress read all"
  ON public.program_content_progress
  FOR SELECT
  USING (true);

CREATE FUNCTION test.unexpected_select_identity() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(
    E'\x1e',
    coalesce(test.progress_fingerprint(), '<null>'),
    coalesce(test.progress_values(), '<null>'),
    coalesce(test.helper_identity(), '<null>'),
    coalesce(test.ledger_identity(), '<null>'),
    coalesce((
      SELECT progress_table.relacl::text
      FROM pg_class AS progress_table
      WHERE progress_table.oid = 'public.program_content_progress'::regclass
    ), '<null>'),
    coalesce((
      SELECT string_agg(
        concat_ws(
          '|',
          policy.polname,
          policy.polcmd::text,
          policy.polpermissive::text,
          policy.polroles::text,
          coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
          coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
        ),
        E'\n' ORDER BY policy.polname
      )
      FROM pg_policy AS policy
      WHERE policy.polrelid = 'public.program_content_progress'::regclass
    ), '<none>'),
    coalesce((
      SELECT string_agg(
        attribute.attname || '=' || coalesce(attribute.attacl::text, '<none>'),
        ',' ORDER BY attribute.attnum
      )
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.program_content_progress'::regclass
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ), '<none>')
  )
$$;
CREATE TABLE test.unexpected_select_previous (
  identity text NOT NULL
);
INSERT INTO test.unexpected_select_previous
SELECT test.unexpected_select_identity();
\quit
\endif

\if :{?negative_assert}
DO $unexpected_rolled_back$
DECLARE
  v_previous text;
  v_visible bigint;
BEGIN
  SELECT identity INTO v_previous FROM test.unexpected_select_previous;
  IF v_previous IS DISTINCT FROM test.unexpected_select_identity() THEN
    RAISE EXCEPTION
      'unexpected SELECT migration did not roll back privileges, policies, progress, helper, or ledger';
  END IF;
  IF test.ledger_identity() IS DISTINCT FROM '1:20261109220000' THEN
    RAISE EXCEPTION 'unexpected SELECT migration changed the ledger to %', test.ledger_identity();
  END IF;
  IF (
    SELECT count(*)
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
  ) <> 4
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polname = 'progress read all'
      AND polcmd = 'r'
      AND polpermissive
      AND pg_get_expr(polqual, polrelid) = 'true'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polname = 'Users can insert own program_content_progress'
      AND polcmd = 'a'
  )
  OR NOT has_table_privilege('authenticated', 'public.program_content_progress', 'INSERT')
  OR NOT has_table_privilege('authenticated', 'public.program_content_progress', 'UPDATE')
  OR NOT has_table_privilege('public', 'public.program_content_progress', 'INSERT')
  OR NOT has_column_privilege(
    'authenticated', 'public.program_content_progress'::regclass, 'notes'::name, 'UPDATE'
  )
  OR NOT has_table_privilege('service_role', 'public.program_content_progress', 'INSERT')
  THEN
    RAISE EXCEPTION 'unexpected SELECT rollback left a different privilege or policy state';
  END IF;
  IF (SELECT count(*) FROM public.program_content_progress) <> 3 THEN
    RAISE EXCEPTION 'unexpected SELECT migration changed progress rows';
  END IF;

  SET LOCAL request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_visible FROM public.program_content_progress;
  EXECUTE 'RESET ROLE';
  IF v_visible <> 3 THEN
    RAISE EXCEPTION
      'planted permissive SELECT was not preserved by rollback, visible=%', v_visible;
  END IF;
  RAISE NOTICE 'PASS unexpected permissive SELECT rolled back';
END;
$unexpected_rolled_back$;
\quit
\endif

-- Disposable authorization fixture. Synthetic ids only. The curriculum helper
-- body is the pinned definition from 20261109220000; this file does not edit
-- that migration. The cluster is local and is removed by the runner.

CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE public_writer NOLOGIN NOINHERIT;
GRANT anon, authenticated, service_role, public_writer TO CURRENT_USER;

CREATE SCHEMA auth;
CREATE SCHEMA test;
GRANT USAGE ON SCHEMA auth, test, public TO anon, authenticated, service_role, public_writer;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.people (
  id uuid PRIMARY KEY,
  auth_user_id uuid
);
CREATE TABLE public.programs (
  id uuid PRIMARY KEY,
  slug text
);
CREATE TABLE public.person_entitlements (
  person_id uuid,
  entitlement_key text,
  is_active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  source text,
  source_ref text
);
CREATE TABLE public.program_assignments (
  person_id uuid,
  program_slug text,
  acquisition_source text,
  source_ref text,
  status text,
  active_from timestamptz,
  active_to timestamptz
);
CREATE TABLE public.program_content_items (
  id uuid PRIMARY KEY
);

CREATE SCHEMA programs_private;
CREATE FUNCTION programs_private.current_user_has_program_access(
  p_program_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.programs AS program ON program.id = p_program_id
      WHERE person.auth_user_id = (SELECT auth.uid())
        AND (
          EXISTS (
            SELECT 1
            FROM public.person_entitlements AS entitlement
            WHERE entitlement.person_id = person.id
              AND entitlement.entitlement_key = 'program:' || program.slug
              AND entitlement.is_active
              AND entitlement.starts_at <= pg_catalog.now()
              AND (entitlement.ends_at IS NULL OR entitlement.ends_at > pg_catalog.now())
          )
          OR EXISTS (
            SELECT 1
            FROM public.program_assignments AS assignment
            WHERE assignment.person_id = person.id
              AND assignment.program_slug = program.slug
              AND assignment.status = 'active'
              AND (assignment.active_from IS NULL OR assignment.active_from <= pg_catalog.now())
              AND (assignment.active_to IS NULL OR assignment.active_to > pg_catalog.now())
              AND (
                assignment.acquisition_source IN
                  ('admin_grant', 'offer', 'bundle', 'other')
                OR (
                  assignment.acquisition_source = 'purchase'
                  AND NULLIF(pg_catalog.btrim(assignment.source_ref), '') IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.person_entitlements AS stripe_entitlement
                    WHERE stripe_entitlement.person_id = person.id
                      AND stripe_entitlement.entitlement_key =
                        'program:' || program.slug
                      AND stripe_entitlement.source = 'stripe'
                      AND stripe_entitlement.is_active
                      AND stripe_entitlement.starts_at <= pg_catalog.now()
                      AND (
                        stripe_entitlement.ends_at IS NULL
                        OR stripe_entitlement.ends_at > pg_catalog.now()
                      )
                      AND NULLIF(
                        pg_catalog.btrim(stripe_entitlement.source_ref), ''
                      ) IS NOT NULL
                      AND stripe_entitlement.source_ref = assignment.source_ref
                  )
                )
              )
          )
        )
    )
$function$;

REVOKE ALL ON FUNCTION programs_private.current_user_has_program_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA programs_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
GRANT EXECUTE ON FUNCTION programs_private.current_user_has_program_access(uuid)
  TO authenticated;

CREATE TABLE public.program_content_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_slug text NOT NULL,
  content_item_id uuid NOT NULL REFERENCES public.program_content_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  notes text,
  CONSTRAINT program_content_progress_person_item_unique UNIQUE (person_id, content_item_id)
);
ALTER TABLE public.program_content_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own program_content_progress"
  ON public.program_content_progress
  FOR SELECT
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own program_content_progress"
  ON public.program_content_progress
  FOR INSERT
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own program_content_progress"
  ON public.program_content_progress
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

GRANT SELECT ON public.people TO anon, authenticated, public_writer;
GRANT SELECT, INSERT, UPDATE ON public.program_content_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_content_progress TO service_role;
GRANT INSERT, UPDATE ON public.program_content_progress TO PUBLIC;
GRANT UPDATE ON public.program_content_progress TO anon;
GRANT TRUNCATE ON public.program_content_progress TO authenticated;
GRANT DELETE ON public.program_content_progress TO anon;
GRANT UPDATE (notes) ON public.program_content_progress TO authenticated;

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY
);
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20261109220000');

INSERT INTO public.people (id, auth_user_id) VALUES
  ('30000000-0000-4000-8000-000000000301', '40000000-0000-4000-8000-000000000401'),
  ('30000000-0000-4000-8000-000000000302', '40000000-0000-4000-8000-000000000402');
INSERT INTO public.program_content_items (id) VALUES
  ('60000000-0000-4000-8000-000000000601'),
  ('60000000-0000-4000-8000-000000000602'),
  ('60000000-0000-4000-8000-000000000697'),
  ('60000000-0000-4000-8000-000000000698'),
  ('60000000-0000-4000-8000-000000000699');
INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes) VALUES
  ('30000000-0000-4000-8000-000000000301', 'local-program', '60000000-0000-4000-8000-000000000601', 'in_progress', 'seed-a'),
  ('30000000-0000-4000-8000-000000000302', 'local-program', '60000000-0000-4000-8000-000000000602', 'completed', 'seed-b');

CREATE FUNCTION test.progress_fingerprint() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT count(*)::text || ':' || coalesce(
    md5(string_agg(md5(progress_row.ctid::text || progress_row::text), ',' ORDER BY progress_row.ctid::text)),
    md5('')
  )
  FROM public.program_content_progress AS progress_row
$$;
CREATE FUNCTION test.progress_values() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT count(*)::text || ':' || coalesce(
    md5(string_agg(progress_row::text, ',' ORDER BY progress_row.content_item_id::text)),
    md5('')
  )
  FROM public.program_content_progress AS progress_row
$$;
CREATE FUNCTION test.helper_identity() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(
    E'\n',
    pg_get_functiondef(helper.oid),
    coalesce(helper.proacl::text, '<default>'),
    coalesce(helper_schema.nspacl::text, '<default>')
  )
  FROM pg_proc AS helper
  JOIN pg_namespace AS helper_schema ON helper_schema.oid = helper.pronamespace
  WHERE helper_schema.nspname = 'programs_private'
    AND helper.proname = 'current_user_has_program_access'
$$;
CREATE FUNCTION test.ledger_identity() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT count(*)::text || ':' || coalesce(string_agg(version, ',' ORDER BY version), '')
  FROM supabase_migrations.schema_migrations
$$;
CREATE TEMP TABLE preserved_identity (
  progress_fingerprint text NOT NULL,
  progress_values text NOT NULL,
  helper_identity text NOT NULL,
  ledger_identity text NOT NULL,
  select_policy text NOT NULL
);
INSERT INTO preserved_identity
SELECT
  test.progress_fingerprint(),
  test.progress_values(),
  test.helper_identity(),
  test.ledger_identity(),
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.program_content_progress'::regclass
      AND policy.polname = 'Users can read own program_content_progress'
  );

DO $before_privileges$
BEGIN
  IF NOT has_table_privilege('public', 'public.program_content_progress', 'INSERT')
     OR NOT has_table_privilege('public', 'public.program_content_progress', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.program_content_progress', 'INSERT')
     OR NOT has_table_privilege('anon', 'public.program_content_progress', 'UPDATE')
     OR NOT has_column_privilege(
       'authenticated', 'public.program_content_progress'::regclass, 'notes'::name, 'UPDATE'
     )
  THEN
    RAISE EXCEPTION 'PUBLIC write grant was not seeded';
  END IF;
  RAISE NOTICE 'PASS PUBLIC write grant seeded';
END;
$before_privileges$;

SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE public_writer;
INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes)
VALUES (
  '30000000-0000-4000-8000-000000000301',
  'local-program',
  '60000000-0000-4000-8000-000000000698',
  'in_progress',
  'public-writer-before'
);
RESET ROLE;
DELETE FROM public.program_content_progress
WHERE content_item_id = '60000000-0000-4000-8000-000000000698';

SET ROLE authenticated;
INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes)
VALUES (
  '30000000-0000-4000-8000-000000000301',
  'local-program',
  '60000000-0000-4000-8000-000000000699',
  'in_progress',
  'authenticated-before'
);
UPDATE public.program_content_progress
SET notes = 'authenticated-update-before'
WHERE content_item_id = '60000000-0000-4000-8000-000000000601';
RESET ROLE;
DELETE FROM public.program_content_progress
WHERE content_item_id = '60000000-0000-4000-8000-000000000699';
UPDATE public.program_content_progress
SET notes = 'seed-a'
WHERE content_item_id = '60000000-0000-4000-8000-000000000601';

DO $seed_unchanged$
BEGIN
  IF (SELECT progress_values FROM preserved_identity) IS DISTINCT FROM test.progress_values() THEN
    RAISE EXCEPTION 'pre-migration proof changed the seeded progress values';
  END IF;
  UPDATE preserved_identity
  SET progress_fingerprint = test.progress_fingerprint();
  RAISE NOTICE 'PASS seeded rows restored before migration';
END;
$seed_unchanged$;

\ir :migration_path

DO $after_first$
BEGIN
  IF (SELECT progress_fingerprint FROM preserved_identity) IS DISTINCT FROM test.progress_fingerprint() THEN
    RAISE EXCEPTION 'first migration changed progress rows';
  END IF;
  IF (SELECT helper_identity FROM preserved_identity) IS DISTINCT FROM test.helper_identity() THEN
    RAISE EXCEPTION 'first migration changed the curriculum helper';
  END IF;
  IF (SELECT ledger_identity FROM preserved_identity) IS DISTINCT FROM test.ledger_identity() THEN
    RAISE EXCEPTION 'first migration changed the migration ledger';
  END IF;
  IF (SELECT select_policy FROM preserved_identity) IS DISTINCT FROM (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.program_content_progress'::regclass
      AND policy.polname = 'Users can read own program_content_progress'
  ) THEN
    RAISE EXCEPTION 'first migration changed the own-person SELECT policy';
  END IF;
  IF has_table_privilege('anon', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('anon', 'public.program_content_progress', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'TRUNCATE')
     OR has_table_privilege('public', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('public', 'public.program_content_progress', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.program_content_progress'::regclass, 'notes'::name, 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.program_content_progress', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.program_content_progress', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.program_content_progress', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.program_content_progress', 'DELETE')
  THEN
    RAISE EXCEPTION 'first migration left an unexpected privilege state';
  END IF;
  RAISE NOTICE 'PASS first migration preserved rows, helper, ledger, and privileges';
END;
$after_first$;

SET ROLE anon;
DO $anon_denied$
BEGIN
  INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status)
  VALUES (
    '30000000-0000-4000-8000-000000000301',
    'local-program',
    '60000000-0000-4000-8000-000000000698',
    'in_progress'
  );
  RAISE EXCEPTION 'anon insert was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS anon insert denied';
END;
$anon_denied$;
DO $anon_update_denied$
BEGIN
  UPDATE public.program_content_progress SET notes = 'anon-update';
  RAISE EXCEPTION 'anon update was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS anon update denied';
END;
$anon_update_denied$;
RESET ROLE;

SET ROLE public_writer;
DO $public_denied$
BEGIN
  INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status)
  VALUES (
    '30000000-0000-4000-8000-000000000301',
    'local-program',
    '60000000-0000-4000-8000-000000000698',
    'in_progress'
  );
  RAISE EXCEPTION 'PUBLIC-only insert was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS PUBLIC-only insert denied';
END;
$public_denied$;
RESET ROLE;

SET ROLE authenticated;
DO $member_insert_denied$
BEGIN
  INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status)
  VALUES (
    '30000000-0000-4000-8000-000000000301',
    'local-program',
    '60000000-0000-4000-8000-000000000699',
    'in_progress'
  );
  RAISE EXCEPTION 'authenticated insert was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS authenticated insert denied';
END;
$member_insert_denied$;
DO $member_update_denied$
BEGIN
  UPDATE public.program_content_progress
  SET notes = 'member-update'
  WHERE content_item_id = '60000000-0000-4000-8000-000000000601';
  RAISE EXCEPTION 'authenticated update was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS authenticated update denied';
END;
$member_update_denied$;
DO $member_upsert_denied$
BEGIN
  INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes)
  VALUES (
    '30000000-0000-4000-8000-000000000301',
    'local-program',
    '60000000-0000-4000-8000-000000000601',
    'completed',
    'member-upsert'
  )
  ON CONFLICT (person_id, content_item_id) DO UPDATE SET notes = EXCLUDED.notes;
  RAISE EXCEPTION 'authenticated upsert was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS authenticated upsert denied';
END;
$member_upsert_denied$;
DO $own_select$
DECLARE
  v_own bigint;
  v_other bigint;
BEGIN
  SELECT count(*) INTO v_own FROM public.program_content_progress;
  SELECT count(*) INTO v_other
  FROM public.program_content_progress
  WHERE content_item_id = '60000000-0000-4000-8000-000000000602';
  IF v_own <> 1 OR v_other <> 0 THEN
    RAISE EXCEPTION 'own-person select returned own=% other=%', v_own, v_other;
  END IF;
  RAISE NOTICE 'PASS own-person select';
END;
$own_select$;
RESET ROLE;

SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000402';
SET ROLE authenticated;
DO $other_select$
DECLARE
  v_own bigint;
BEGIN
  SELECT count(*) INTO v_own
  FROM public.program_content_progress
  WHERE content_item_id = '60000000-0000-4000-8000-000000000602';
  IF v_own <> 1 THEN
    RAISE EXCEPTION 'second member could not read own progress';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_content_progress
    WHERE content_item_id = '60000000-0000-4000-8000-000000000601'
  ) THEN
    RAISE EXCEPTION 'second member read another person progress row';
  END IF;
  RAISE NOTICE 'PASS other-person select remains scoped';
END;
$other_select$;
RESET ROLE;

SET ROLE service_role;
UPDATE public.program_content_progress
SET notes = 'privileged-update'
WHERE content_item_id = '60000000-0000-4000-8000-000000000601';
INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes)
VALUES (
  '30000000-0000-4000-8000-000000000301',
  'local-program',
  '60000000-0000-4000-8000-000000000697',
  'in_progress',
  'privileged-insert'
)
ON CONFLICT (person_id, content_item_id) DO UPDATE SET notes = EXCLUDED.notes;
DELETE FROM public.program_content_progress
WHERE content_item_id = '60000000-0000-4000-8000-000000000697';
RESET ROLE;

DO $privileged_result$
DECLARE
  v_notes text;
  v_count bigint;
BEGIN
  SELECT notes INTO v_notes
  FROM public.program_content_progress
  WHERE content_item_id = '60000000-0000-4000-8000-000000000601';
  SELECT count(*) INTO v_count FROM public.program_content_progress;
  IF v_notes IS DISTINCT FROM 'privileged-update' OR v_count <> 2 THEN
    RAISE EXCEPTION 'service_role CRUD did not stick: notes=% count=%', v_notes, v_count;
  END IF;
  RAISE NOTICE 'PASS service_role CRUD';
END;
$privileged_result$;

UPDATE preserved_identity
SET progress_fingerprint = test.progress_fingerprint();

\ir :migration_path

DO $after_repeat$
BEGIN
  IF (SELECT progress_fingerprint FROM preserved_identity) IS DISTINCT FROM test.progress_fingerprint() THEN
    RAISE EXCEPTION 'repeat migration changed progress rows';
  END IF;
  IF (SELECT helper_identity FROM preserved_identity) IS DISTINCT FROM test.helper_identity() THEN
    RAISE EXCEPTION 'repeat migration changed the curriculum helper';
  END IF;
  IF (SELECT ledger_identity FROM preserved_identity) IS DISTINCT FROM test.ledger_identity() THEN
    RAISE EXCEPTION 'repeat migration changed the migration ledger';
  END IF;
  IF has_table_privilege('authenticated', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('public', 'public.program_content_progress', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.program_content_progress', 'SELECT')
  THEN
    RAISE EXCEPTION 'repeat migration did not keep the denied privilege state';
  END IF;
  RAISE NOTICE 'PASS repeat migration';
END;
$after_repeat$;

CREATE POLICY "Users can insert own program_content_progress"
  ON public.program_content_progress
  FOR INSERT
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own program_content_progress"
  ON public.program_content_progress
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
GRANT INSERT, UPDATE ON TABLE public.program_content_progress TO authenticated;

SET request.jwt.claim.sub = '40000000-0000-4000-8000-000000000401';
SET ROLE authenticated;
INSERT INTO public.program_content_progress (person_id, program_slug, content_item_id, status, notes)
VALUES (
  '30000000-0000-4000-8000-000000000301',
  'local-program',
  '60000000-0000-4000-8000-000000000699',
  'in_progress',
  'restored-grant'
);
RESET ROLE;

\ir :migration_path

SET ROLE authenticated;
DO $restored_denied$
BEGIN
  UPDATE public.program_content_progress
  SET notes = 'after-restore'
  WHERE content_item_id = '60000000-0000-4000-8000-000000000699';
  RAISE EXCEPTION 'authenticated update was allowed after re-applying the migration';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS re-applied migration denies authenticated update';
END;
$restored_denied$;
RESET ROLE;

DO $final_state$
DECLARE
  v_notes text;
BEGIN
  SELECT notes INTO v_notes
  FROM public.program_content_progress
  WHERE content_item_id = '60000000-0000-4000-8000-000000000699';
  IF v_notes IS DISTINCT FROM 'restored-grant' THEN
    RAISE EXCEPTION 're-applied migration changed the restored progress row';
  END IF;
  IF (SELECT helper_identity FROM preserved_identity) IS DISTINCT FROM test.helper_identity() THEN
    RAISE EXCEPTION 'final helper identity changed';
  END IF;
  IF test.ledger_identity() IS DISTINCT FROM '1:20261109220000' THEN
    RAISE EXCEPTION 'final ledger identity is %', test.ledger_identity();
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polcmd IN ('a', 'w', 'd', '*')
  ) THEN
    RAISE EXCEPTION 'write policy remains after the final migration';
  END IF;
  RAISE NOTICE 'PASS final rows, helper, and ledger';
END;
$final_state$;

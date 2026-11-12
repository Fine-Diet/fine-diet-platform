-- Deny direct Data API writes to program progress.
--
-- Member progress is written by the application service role after its curriculum
-- check. This migration removes direct INSERT and UPDATE for anon and
-- authenticated, including privileges inherited from PUBLIC and column-level
-- grants. TRUNCATE and DELETE are removed with them so a default ALL grant
-- cannot empty the table.
--
-- Authenticated own-person SELECT, service_role CRUD, and
-- programs_private.current_user_has_program_access are preserved.
-- Exactly one policy may survive: the permissive own-person SELECT for
-- either PUBLIC or authenticated. The ownership predicate and role set are
-- preserved, so an authenticated policy is not widened to PUBLIC.
-- Any other policy, including an additional permissive SELECT, aborts and rolls back.
-- Progress rows are not modified. The migration ledger is not modified.
--
-- REVOKE and DROP POLICY IF EXISTS make a second run a forward repair.
-- Apply only after review. This file does not install itself remotely.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $preflight$
DECLARE
  v_missing_columns text[];
  v_missing_roles text[];
  v_helper_count integer;
BEGIN
  IF to_regclass('public.program_content_progress') IS NULL THEN
    RAISE EXCEPTION
      'progress write denial requires public.program_content_progress';
  END IF;

  SELECT array_agg(required.column_name ORDER BY required.column_name)
    INTO v_missing_columns
  FROM (VALUES
    ('person_id'),
    ('content_item_id'),
    ('program_slug'),
    ('status')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'program_content_progress'
      AND column_info.column_name = required.column_name
  );

  IF COALESCE(cardinality(v_missing_columns), 0) > 0 THEN
    RAISE EXCEPTION
      'progress write denial requires columns: %',
      array_to_string(v_missing_columns, ', ');
  END IF;

  SELECT array_agg(required.role_name ORDER BY required.role_name)
    INTO v_missing_roles
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS required(role_name)
  WHERE to_regrole(required.role_name) IS NULL;

  IF COALESCE(cardinality(v_missing_roles), 0) > 0 THEN
    RAISE EXCEPTION
      'progress write denial requires Supabase roles: %',
      array_to_string(v_missing_roles, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.program_content_progress'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires row level security on program_content_progress';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires service_role to bypass row level security';
  END IF;

  IF NOT (
    has_table_privilege('service_role', 'public.program_content_progress', 'SELECT')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'INSERT')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'UPDATE')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'DELETE')
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires existing service_role SELECT, INSERT, UPDATE, and DELETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polcmd = 'r'
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires the existing own-person SELECT policy';
  END IF;

  SELECT count(*)
    INTO v_helper_count
  FROM pg_proc AS helper
  JOIN pg_namespace AS helper_schema ON helper_schema.oid = helper.pronamespace
  WHERE helper_schema.nspname = 'programs_private'
    AND helper.proname = 'current_user_has_program_access';

  IF v_helper_count <> 1 THEN
    RAISE EXCEPTION
      'progress write denial requires exactly one curriculum authorization helper';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS helper
    JOIN pg_namespace AS helper_schema ON helper_schema.oid = helper.pronamespace
    WHERE helper_schema.nspname = 'programs_private'
      AND helper.proname = 'current_user_has_program_access'
      AND helper.pronargs = 1
      AND helper.proargtypes[0] = 'uuid'::regtype
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires current_user_has_program_access(uuid)';
  END IF;
END;
$preflight$;

LOCK TABLE public.program_content_progress IN ACCESS EXCLUSIVE MODE;

DO $snapshot$
DECLARE
  v_row_count bigint;
  v_row_fingerprint text;
  v_helper text;
  v_select_policies text;
  v_service_privileges text;
  v_rls_flags text;
BEGIN
  SELECT count(*),
         coalesce(
           md5(string_agg(
             md5(progress_row.ctid::text || progress_row::text),
             ',' ORDER BY progress_row.ctid::text
           )),
           md5('')
         )
    INTO v_row_count, v_row_fingerprint
  FROM public.program_content_progress AS progress_row;

  SELECT concat_ws(
           E'\n',
           pg_get_functiondef(helper.oid),
           coalesce(helper.proacl::text, '<default>'),
           coalesce(helper.proconfig::text, '<default>'),
           helper.prosecdef::text,
           helper.proowner::text,
           coalesce(helper_schema.nspacl::text, '<default>')
         )
    INTO v_helper
  FROM pg_proc AS helper
  JOIN pg_namespace AS helper_schema ON helper_schema.oid = helper.pronamespace
  WHERE helper_schema.nspname = 'programs_private'
    AND helper.proname = 'current_user_has_program_access';

  IF v_helper IS NULL THEN
    RAISE EXCEPTION
      'progress write denial lost the curriculum authorization helper while locking';
  END IF;

  SELECT coalesce(string_agg(
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
         ), '')
    INTO v_select_policies
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'public.program_content_progress'::regclass
    AND policy.polcmd = 'r';

  IF v_select_policies = '' THEN
    RAISE EXCEPTION
      'progress write denial requires the existing SELECT policy while locking';
  END IF;

  SELECT coalesce(string_agg(
           privilege.privilege_type || ':' || grantor_role.rolname || ':' ||
             privilege.is_grantable::text,
           ',' ORDER BY privilege.privilege_type, grantor_role.rolname
         ), '')
    INTO v_service_privileges
  FROM pg_class AS progress_table
  CROSS JOIN LATERAL pg_catalog.aclexplode(progress_table.relacl) AS privilege
  JOIN pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
  JOIN pg_roles AS grantor_role ON grantor_role.oid = privilege.grantor
  WHERE progress_table.oid = 'public.program_content_progress'::regclass
    AND grantee_role.rolname = 'service_role';

  SELECT progress_table.relrowsecurity::text || ':' ||
         progress_table.relforcerowsecurity::text
    INTO v_rls_flags
  FROM pg_class AS progress_table
  WHERE progress_table.oid = 'public.program_content_progress'::regclass;

  CREATE TEMP TABLE progress_rls_snapshot (
    row_count bigint NOT NULL,
    row_fingerprint text NOT NULL,
    helper_identity text NOT NULL,
    select_policies text NOT NULL,
    service_role_privileges text NOT NULL,
    rls_flags text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO progress_rls_snapshot (
    row_count,
    row_fingerprint,
    helper_identity,
    select_policies,
    service_role_privileges,
    rls_flags
  )
  VALUES (
    v_row_count,
    v_row_fingerprint,
    v_helper,
    v_select_policies,
    v_service_privileges,
    v_rls_flags
  );
END;
$snapshot$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.program_content_progress
  FROM PUBLIC, anon, authenticated;
REVOKE ALL
  ON TABLE public.program_content_progress
  FROM PUBLIC;

DO $revoke_columns$
DECLARE
  v_column text;
BEGIN
  FOR v_column IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.program_content_progress'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY attribute.attnum
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.program_content_progress FROM PUBLIC, anon, authenticated',
      v_column,
      v_column
    );
  END LOOP;
END;
$revoke_columns$;

GRANT SELECT ON TABLE public.program_content_progress TO authenticated;

DROP POLICY IF EXISTS "Users can insert own program_content_progress"
  ON public.program_content_progress;
DROP POLICY IF EXISTS "Users can update own program_content_progress"
  ON public.program_content_progress;

DO $postcondition$
DECLARE
  v_snapshot progress_rls_snapshot%ROWTYPE;
  v_row_count bigint;
  v_row_fingerprint text;
  v_helper text;
  v_select_policies text;
  v_service_privileges text;
  v_rls_flags text;
  v_authenticated oid;
BEGIN
  SELECT *
    INTO v_snapshot
  FROM progress_rls_snapshot;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'progress write denial snapshot is missing';
  END IF;

  SELECT count(*),
         coalesce(
           md5(string_agg(
             md5(progress_row.ctid::text || progress_row::text),
             ',' ORDER BY progress_row.ctid::text
           )),
           md5('')
         )
    INTO v_row_count, v_row_fingerprint
  FROM public.program_content_progress AS progress_row;

  IF v_row_count IS DISTINCT FROM v_snapshot.row_count
     OR v_row_fingerprint IS DISTINCT FROM v_snapshot.row_fingerprint THEN
    RAISE EXCEPTION 'progress write denial changed program_content_progress rows';
  END IF;

  SELECT concat_ws(
           E'\n',
           pg_get_functiondef(helper.oid),
           coalesce(helper.proacl::text, '<default>'),
           coalesce(helper.proconfig::text, '<default>'),
           helper.prosecdef::text,
           helper.proowner::text,
           coalesce(helper_schema.nspacl::text, '<default>')
         )
    INTO v_helper
  FROM pg_proc AS helper
  JOIN pg_namespace AS helper_schema ON helper_schema.oid = helper.pronamespace
  WHERE helper_schema.nspname = 'programs_private'
    AND helper.proname = 'current_user_has_program_access';

  IF v_helper IS DISTINCT FROM v_snapshot.helper_identity THEN
    RAISE EXCEPTION
      'progress write denial changed the curriculum authorization helper';
  END IF;

  SELECT coalesce(string_agg(
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
         ), '')
    INTO v_select_policies
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'public.program_content_progress'::regclass
    AND policy.polcmd = 'r';

  IF v_select_policies IS DISTINCT FROM v_snapshot.select_policies THEN
    RAISE EXCEPTION 'progress write denial changed the own-person SELECT policy';
  END IF;

  SELECT coalesce(string_agg(
           privilege.privilege_type || ':' || grantor_role.rolname || ':' ||
             privilege.is_grantable::text,
           ',' ORDER BY privilege.privilege_type, grantor_role.rolname
         ), '')
    INTO v_service_privileges
  FROM pg_class AS progress_table
  CROSS JOIN LATERAL pg_catalog.aclexplode(progress_table.relacl) AS privilege
  JOIN pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
  JOIN pg_roles AS grantor_role ON grantor_role.oid = privilege.grantor
  WHERE progress_table.oid = 'public.program_content_progress'::regclass
    AND grantee_role.rolname = 'service_role';

  IF v_service_privileges IS DISTINCT FROM v_snapshot.service_role_privileges THEN
    RAISE EXCEPTION 'progress write denial changed service_role progress privileges';
  END IF;

  SELECT progress_table.relrowsecurity::text || ':' ||
         progress_table.relforcerowsecurity::text
    INTO v_rls_flags
  FROM pg_class AS progress_table
  WHERE progress_table.oid = 'public.program_content_progress'::regclass;

  IF v_rls_flags IS DISTINCT FROM v_snapshot.rls_flags THEN
    RAISE EXCEPTION 'progress write denial changed row level security flags';
  END IF;

  IF has_table_privilege('anon', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('anon', 'public.program_content_progress', 'UPDATE')
     OR has_table_privilege('anon', 'public.program_content_progress', 'DELETE')
     OR has_table_privilege('anon', 'public.program_content_progress', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'DELETE')
     OR has_table_privilege('authenticated', 'public.program_content_progress', 'TRUNCATE')
     OR has_table_privilege('public', 'public.program_content_progress', 'INSERT')
     OR has_table_privilege('public', 'public.program_content_progress', 'UPDATE')
     OR has_table_privilege('public', 'public.program_content_progress', 'DELETE')
     OR has_table_privilege('public', 'public.program_content_progress', 'TRUNCATE')
  THEN
    RAISE EXCEPTION
      'direct progress writes remain for anon, authenticated, or PUBLIC';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.program_content_progress', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated progress SELECT was not preserved';
  END IF;

  IF NOT (
    has_table_privilege('service_role', 'public.program_content_progress', 'SELECT')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'INSERT')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'UPDATE')
    AND has_table_privilege('service_role', 'public.program_content_progress', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'service_role progress CRUD was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.program_content_progress'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        has_column_privilege('anon', attribute.attrelid, attribute.attnum, 'INSERT')
        OR has_column_privilege('anon', attribute.attrelid, attribute.attnum, 'UPDATE')
        OR has_column_privilege('authenticated', attribute.attrelid, attribute.attnum, 'INSERT')
        OR has_column_privilege('authenticated', attribute.attrelid, attribute.attnum, 'UPDATE')
        OR has_column_privilege('public', attribute.attrelid, attribute.attnum, 'INSERT')
        OR has_column_privilege('public', attribute.attrelid, attribute.attnum, 'UPDATE')
      )
  ) THEN
    RAISE EXCEPTION 'column-level progress INSERT or UPDATE remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polcmd IN ('a', 'w', 'd', '*')
  ) THEN
    RAISE EXCEPTION
      'progress INSERT, UPDATE, DELETE, or ALL policies remain';
  END IF;

  SELECT oid
    INTO v_authenticated
  FROM pg_roles
  WHERE rolname = 'authenticated';

  IF v_authenticated IS NULL THEN
    RAISE EXCEPTION
      'progress write denial requires Supabase roles: authenticated';
  END IF;

  -- PUBLIC ({0}) and authenticated are the only accepted role sets. The
  -- policy is not rewritten, so this normalization cannot widen reads.
  IF (
    SELECT count(*)
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
  ) <> 1
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.program_content_progress'::regclass
      AND polname = 'Users can read own program_content_progress'
      AND polpermissive
      AND polcmd = 'r'
      AND (
        polroles = ARRAY[0]::oid[]
        OR polroles = ARRAY[v_authenticated]::oid[]
      )
      AND polwithcheck IS NULL
      AND pg_get_expr(polqual, polrelid) = $own$(person_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = auth.uid())))$own$
  ) THEN
    RAISE EXCEPTION
      'progress write denial requires exactly the own-person SELECT policy';
  END IF;
END;
$postcondition$;

COMMIT;

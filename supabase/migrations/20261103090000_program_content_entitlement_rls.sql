-- Protect program curriculum at the Data API boundary.
--
-- The application contract is program:<slug> entitlement OR a currently
-- active, in-window program assignment. Enrollment is runtime state and does
-- not independently grant access. Existing permissive publication/enrollment
-- policies remain in place; this restrictive policy ANDs the current access
-- decision with them so their publication, ownership, and day visibility
-- checks continue to apply.
--
-- Server routes and admin authoring use service_role and retain CRUD access.
-- Apply only after review; this file does not install itself remotely.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $preflight$
DECLARE
  v_missing_tables text[];
  v_missing_columns text[];
  v_missing_roles text[];
  v_rls_disabled text[];
BEGIN
  SELECT array_agg(t.table_name ORDER BY t.table_name)
    INTO v_missing_tables
  FROM unnest(ARRAY[
    'people', 'programs', 'program_modules', 'program_content_items',
    'program_delivery_modules', 'person_entitlements', 'program_assignments'
  ]) AS t(table_name)
  WHERE to_regclass(format('public.%I', t.table_name)) IS NULL;

  IF COALESCE(cardinality(v_missing_tables), 0) > 0 THEN
    RAISE EXCEPTION 'Program content RLS requires tables: %',
      array_to_string(v_missing_tables, ', ');
  END IF;

  SELECT array_agg(required.column_name ORDER BY required.table_name, required.column_name)
    INTO v_missing_columns
  FROM (VALUES
    ('people', 'auth_user_id'),
    ('programs', 'slug'),
    ('program_modules', 'program_id'),
    ('program_content_items', 'module_id'),
    ('program_delivery_modules', 'program_id'),
    ('person_entitlements', 'person_id'),
    ('person_entitlements', 'entitlement_key'),
    ('person_entitlements', 'is_active'),
    ('person_entitlements', 'starts_at'),
    ('person_entitlements', 'ends_at'),
    ('program_assignments', 'person_id'),
    ('program_assignments', 'program_slug'),
    ('program_assignments', 'status'),
    ('program_assignments', 'active_from'),
    ('program_assignments', 'active_to')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF COALESCE(cardinality(v_missing_columns), 0) > 0 THEN
    RAISE EXCEPTION 'Program content RLS requires columns: %',
      array_to_string(v_missing_columns, ', ');
  END IF;

  SELECT array_agg(r.role_name ORDER BY r.role_name)
    INTO v_missing_roles
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role_name)
  WHERE to_regrole(r.role_name) IS NULL;

  IF COALESCE(cardinality(v_missing_roles), 0) > 0 THEN
    RAISE EXCEPTION 'Program content RLS requires Supabase roles: %',
      array_to_string(v_missing_roles, ', ');
  END IF;

  SELECT array_agg(t.table_name ORDER BY t.table_name)
    INTO v_rls_disabled
  FROM unnest(ARRAY['program_modules', 'program_content_items', 'program_delivery_modules'])
    AS t(table_name)
  JOIN pg_class c ON c.oid = to_regclass(format('public.%I', t.table_name))
  WHERE NOT c.relrowsecurity;

  IF COALESCE(cardinality(v_rls_disabled), 0) > 0 THEN
    RAISE EXCEPTION 'Program content RLS requires RLS enabled on: %',
      array_to_string(v_rls_disabled, ', ');
  END IF;
END;
$preflight$;

-- Do not expose the private authorization helper through the Data API. Its
-- SECURITY DEFINER body is deliberately scoped to auth.uid() and returns only
-- a boolean; it never accepts a caller-supplied person id.
CREATE SCHEMA IF NOT EXISTS programs_private;

CREATE OR REPLACE FUNCTION programs_private.current_user_has_program_access(
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

-- Anon has no curriculum API. Authenticated reads are row-filtered by RLS;
-- server/admin routes continue to use service_role and its explicit CRUD grant.
REVOKE ALL PRIVILEGES ON TABLE
  public.program_modules,
  public.program_content_items,
  public.program_delivery_modules
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.program_modules,
  public.program_content_items,
  public.program_delivery_modules
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.program_modules,
  public.program_content_items,
  public.program_delivery_modules
TO service_role;

-- Existing permissive policies still require publication and, for delivery
-- cards, a visible non-cancelled enrollment. These restrictive policies add
-- the independent current acquisition/assignment check and compose with any
-- other permissive policy using AND semantics.
DROP POLICY IF EXISTS "Program content requires current access"
  ON public.program_modules;
CREATE POLICY "Program content requires current access"
  ON public.program_modules AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT programs_private.current_user_has_program_access(program_id))
  );

DROP POLICY IF EXISTS "Program content requires current access"
  ON public.program_content_items;
CREATE POLICY "Program content requires current access"
  ON public.program_content_items AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_modules AS module
      WHERE module.id = program_content_items.module_id
        AND (SELECT programs_private.current_user_has_program_access(module.program_id))
    )
  );

DROP POLICY IF EXISTS "Program content requires current access"
  ON public.program_delivery_modules;
CREATE POLICY "Program content requires current access"
  ON public.program_delivery_modules AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT programs_private.current_user_has_program_access(program_id))
  );

COMMIT;

-- Packet 10A post-apply verification (read-only).
-- Expected: every problem query returns zero rows.

-- Expected: zero. RLS remains enabled on the execution table.
SELECT 'rls_disabled' AS problem
FROM pg_class rel
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'grocery_haul_execution_items'
  AND rel.relrowsecurity IS NOT TRUE;

-- Expected: zero. Owner SELECT policy exists, SELECT-only, owner-scoped,
-- and uses initplan-safe (select auth.uid()).
SELECT 'owner_select_policy' AS problem, detail
FROM (
  SELECT
    COUNT(*) FILTER (
      WHERE pol.polname = 'Users can read own grocery_haul_execution_items'
        AND pol.polcmd = 'r'
    ) AS owner_select_count,
    COUNT(*) FILTER (WHERE pol.polcmd <> 'r') AS non_select_count,
    COUNT(*) FILTER (
      WHERE pol.polname = 'Users can read own grocery_haul_execution_items'
        AND pg_get_expr(pol.polqual, pol.polrelid)
          ~* 'people\.auth_user_id'
        AND pg_get_expr(pol.polqual, pol.polrelid)
          ~* '\(\s*SELECT\s+auth\.uid\(\)'
        AND pg_get_expr(pol.polqual, pol.polrelid)
          ~* 'person_id'
        AND pg_get_expr(pol.polqual, pol.polrelid)
          !~ 'auth_user_id\s*=\s*auth\.uid\(\)'
    ) AS initplan_owner_count
  FROM pg_policy pol
  JOIN pg_class rel ON rel.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'grocery_haul_execution_items'
) policy_state
CROSS JOIN LATERAL (
  VALUES
    ('missing_or_not_select', policy_state.owner_select_count = 1),
    ('non_select_policy_present', policy_state.non_select_count = 0),
    ('initplan_owner_scope', policy_state.initplan_owner_count = 1)
) AS assertion(detail, ok)
WHERE assertion.ok IS NOT TRUE;

-- Expected: zero. anon/authenticated remain SELECT-only; service_role DML intact.
SELECT 'table_acl' AS problem, detail
FROM (
  SELECT
    has_table_privilege(
      'anon', 'public.grocery_haul_execution_items', 'SELECT'
    ) AS anon_select,
    has_table_privilege(
      'anon', 'public.grocery_haul_execution_items', 'INSERT'
    ) AS anon_insert,
    has_table_privilege(
      'anon', 'public.grocery_haul_execution_items', 'UPDATE'
    ) AS anon_update,
    has_table_privilege(
      'anon', 'public.grocery_haul_execution_items', 'DELETE'
    ) AS anon_delete,
    has_table_privilege(
      'authenticated', 'public.grocery_haul_execution_items', 'SELECT'
    ) AS authenticated_select,
    has_table_privilege(
      'authenticated', 'public.grocery_haul_execution_items', 'INSERT'
    ) AS authenticated_insert,
    has_table_privilege(
      'authenticated', 'public.grocery_haul_execution_items', 'UPDATE'
    ) AS authenticated_update,
    has_table_privilege(
      'authenticated', 'public.grocery_haul_execution_items', 'DELETE'
    ) AS authenticated_delete,
    has_table_privilege(
      'service_role', 'public.grocery_haul_execution_items', 'SELECT'
    ) AS service_role_select,
    has_table_privilege(
      'service_role', 'public.grocery_haul_execution_items', 'INSERT'
    ) AS service_role_insert,
    has_table_privilege(
      'service_role', 'public.grocery_haul_execution_items', 'UPDATE'
    ) AS service_role_update,
    has_table_privilege(
      'service_role', 'public.grocery_haul_execution_items', 'DELETE'
    ) AS service_role_delete
) acl
CROSS JOIN LATERAL (
  VALUES
    ('anon_select', acl.anon_select),
    ('anon_insert_denied', acl.anon_insert IS NOT TRUE),
    ('anon_update_denied', acl.anon_update IS NOT TRUE),
    ('anon_delete_denied', acl.anon_delete IS NOT TRUE),
    ('authenticated_select', acl.authenticated_select),
    ('authenticated_insert_denied', acl.authenticated_insert IS NOT TRUE),
    ('authenticated_update_denied', acl.authenticated_update IS NOT TRUE),
    ('authenticated_delete_denied', acl.authenticated_delete IS NOT TRUE),
    ('service_role_select', acl.service_role_select),
    ('service_role_insert', acl.service_role_insert),
    ('service_role_update', acl.service_role_update),
    ('service_role_delete', acl.service_role_delete)
) AS assertion(detail, ok)
WHERE assertion.ok IS NOT TRUE;

-- Expected: zero. Packet 9 execution RPCs remain SECURITY INVOKER,
-- search_path-pinned, and service_role-only.
SELECT 'rpc_security' AS problem, assertion.detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL (
  VALUES
    ('security_invoker', p.prosecdef IS NOT TRUE),
    (
      'search_path',
      p.proconfig @> ARRAY['search_path=public, pg_temp']
    ),
    (
      'anon_execute_denied',
      has_function_privilege('anon', p.oid, 'EXECUTE') IS NOT TRUE
    ),
    (
      'authenticated_execute_denied',
      has_function_privilege('authenticated', p.oid, 'EXECUTE') IS NOT TRUE
    ),
    (
      'service_role_execute',
      has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
) AS assertion(detail, ok)
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_grocery_haul_execution_readiness',
    'start_grocery_haul_execution'
  )
  AND assertion.ok IS NOT TRUE;

-- Expected: zero. Snapshot immutability and pending/in_basket/skipped
-- state guards remain in the execution trigger function.
SELECT 'execution_guard' AS problem, detail
FROM (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'guard_grocery_haul_execution_item'
) fn
CROSS JOIN LATERAL (
  VALUES
    (
      'snapshot_immutable',
      fn.definition LIKE '%HAUL_EXECUTION_SNAPSHOT_IMMUTABLE%'
    ),
    (
      'active_only',
      fn.definition LIKE '%HAUL_EXECUTION_NOT_ACTIVE%'
    ),
    (
      'invalid_transition',
      fn.definition LIKE '%HAUL_EXECUTION_INVALID_TRANSITION%'
    ),
    (
      'pending_in_basket_skipped',
      fn.definition LIKE '%pending%'
      AND fn.definition LIKE '%in_basket%'
      AND fn.definition LIKE '%skipped%'
    )
) AS assertion(detail, ok)
WHERE assertion.ok IS NOT TRUE;

-- Expected: zero. Execution guard trigger remains attached.
SELECT 'missing_execution_guard_trigger' AS problem
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table = 'grocery_haul_execution_items'
    AND trigger_name = 'grocery_haul_execution_items_guard'
);

-- Expected: zero. Source / prepared / acquisition columns remain distinct.
SELECT 'missing_truth_column' AS problem, required.table_name, required.column_name
FROM (
  VALUES
    ('grocery_haul_items', 'quantity_snapshot'),
    ('grocery_haul_items', 'final_quantity'),
    ('grocery_haul_execution_items', 'source_quantity_snapshot'),
    ('grocery_haul_execution_items', 'prepared_quantity'),
    ('grocery_haul_execution_items', 'acquired_quantity'),
    ('grocery_haul_execution_items', 'prepared_product_title'),
    ('grocery_haul_execution_items', 'acquired_product_title')
) AS required(table_name, column_name)
LEFT JOIN information_schema.columns column_info
  ON column_info.table_schema = 'public'
 AND column_info.table_name = required.table_name
 AND column_info.column_name = required.column_name
WHERE column_info.column_name IS NULL;

-- Packet 9 post-apply verification (read-only).

-- Expected: zero.
SELECT 'missing_required_column' AS problem, required.table_name, required.column_name
FROM (
  VALUES
    ('grocery_hauls', 'shopping_started_at'),
    ('grocery_haul_execution_items', 'haul_item_id'),
    ('grocery_haul_execution_items', 'state'),
    ('grocery_haul_execution_items', 'prepared_quantity'),
    ('grocery_haul_execution_items', 'prepared_product_title'),
    ('grocery_haul_execution_items', 'prepared_store_location'),
    ('grocery_haul_execution_items', 'prepared_price_amount'),
    ('grocery_haul_execution_items', 'acquired_quantity'),
    ('grocery_haul_execution_items', 'acquired_product_title'),
    ('grocery_haul_execution_items', 'acquired_store_location'),
    ('grocery_haul_execution_items', 'acquired_price_amount')
) AS required(table_name, column_name)
LEFT JOIN information_schema.columns column_info
  ON column_info.table_schema = 'public'
 AND column_info.table_name = required.table_name
 AND column_info.column_name = required.column_name
WHERE column_info.column_name IS NULL;

-- Expected: zero. Exactly one valid execution row per positive prepared item.
SELECT execution.id
FROM public.grocery_haul_execution_items execution
JOIN public.grocery_haul_items item
  ON item.id = execution.haul_item_id
 AND item.haul_id = execution.haul_id
 AND item.person_id = execution.person_id
WHERE item.final_quantity <= 0
   OR execution.prepared_quantity <= 0
   OR execution.state NOT IN ('pending', 'in_basket', 'skipped');

-- Expected: zero. Activation copied final quantity without collapsing source demand.
SELECT execution.id
FROM public.grocery_haul_execution_items execution
JOIN public.grocery_haul_items item ON item.id = execution.haul_item_id
WHERE execution.prepared_quantity IS DISTINCT FROM item.final_quantity;

-- Expected: both functions, SECURITY INVOKER, pinned search_path.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_grocery_haul_execution_readiness',
    'start_grocery_haul_execution'
  )
ORDER BY p.proname;

-- Expected for both: anon=false, authenticated=false, service_role=true.
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_grocery_haul_execution_readiness',
    'start_grocery_haul_execution'
  )
ORDER BY p.proname;

-- Expected: authenticated read=true/direct writes=false, service write=true.
SELECT
  has_table_privilege(
    'authenticated', 'public.grocery_haul_execution_items', 'SELECT'
  ) AS authenticated_read,
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
    'service_role', 'public.grocery_haul_execution_items', 'INSERT, UPDATE, DELETE'
  ) AS service_role_write;

-- Expected: both protection triggers present.
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'grocery_haul_execution_items_guard',
    'grocery_haul_items_preparation_guard'
  )
ORDER BY event_object_table, trigger_name;

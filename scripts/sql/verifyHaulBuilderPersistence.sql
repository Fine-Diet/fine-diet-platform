-- Packet 6 post-apply verification (read-only).

-- Expected: zero. Snapshot and preparation quantities are separate columns.
SELECT 'missing_required_column' AS problem, required.column_name
FROM (
  VALUES
    ('grocery_hauls', 'title'),
    ('grocery_hauls', 'budget_amount'),
    ('grocery_hauls', 'currency'),
    ('grocery_haul_items', 'quantity_snapshot'),
    ('grocery_haul_items', 'final_quantity'),
    ('grocery_haul_items', 'product_title'),
    ('grocery_haul_items', 'retailer'),
    ('grocery_haul_items', 'store_location'),
    ('grocery_haul_items', 'price_amount'),
    ('grocery_haul_items', 'price_source'),
    ('grocery_haul_items', 'resolution_source')
) AS required(table_name, column_name)
LEFT JOIN information_schema.columns column_info
  ON column_info.table_schema = 'public'
 AND column_info.table_name = required.table_name
 AND column_info.column_name = required.column_name
WHERE column_info.column_name IS NULL;

-- Expected: zero. Every final quantity is initialized and valid.
SELECT id
FROM public.grocery_haul_items
WHERE final_quantity IS NULL OR final_quantity < 0;

-- Expected: zero. Price state is complete or entirely unresolved.
SELECT id
FROM public.grocery_haul_items
WHERE (price_amount IS NULL) <> (price_source IS NULL)
   OR (price_amount IS NOT NULL AND price_currency IS NULL);

-- Expected: all three functions, SECURITY INVOKER, pinned search_path.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_grocery_haul_from_list',
    'create_grocery_haul_from_lists',
    'add_grocery_lists_to_haul'
  )
ORDER BY p.proname;

-- Expected for all three: anon=false, authenticated=false, service_role=true.
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_grocery_haul_from_list',
    'create_grocery_haul_from_lists',
    'add_grocery_lists_to_haul'
  )
ORDER BY p.proname;

-- Expected for each table: authenticated read=true and all direct writes=false.
SELECT
  c.relname AS table_name,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
  has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('service_role', c.oid, 'INSERT, UPDATE, DELETE') AS service_role_write
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'grocery_hauls',
    'grocery_haul_items',
    'grocery_haul_source_lists'
  )
ORDER BY c.relname;

-- Expected: both guards present.
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'grocery_haul_items_preparation_guard',
    'grocery_hauls_preparation_guard'
  )
ORDER BY event_object_table, trigger_name;

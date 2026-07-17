-- ============================================================================
-- Grocery Price Search — Stage 1 verification (Preview only)
--
-- Run after applying scripts/sql/createGroceryPriceSearchTables.sql.
-- Every row should show status = 'pass'. Any 'fail' blocks Preview smoke.
--
-- Preview migration ledger (project ref tssvlflebugqhtogqdfs):
--   1) create_grocery_price_search_tables (20260716021915)
--      First apply attempt via Supabase MCP. Ledger entry was recorded, but the
--      submitted SQL payload was truncated before DDL executed, so no pricing
--      objects were created.
--   2) create_grocery_price_search_tables_repair (20260716022026)
--      Re-applied the complete reviewed schema from
--      scripts/sql/createGroceryPriceSearchTables.sql. This entry owns the live
--      Preview objects; the initial entry remains for audit only.
-- ============================================================================

-- 1) Tables exist
SELECT
  expected.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'pass' ELSE 'fail' END AS status,
  'table_exists' AS check_type
FROM (
  VALUES
    ('grocery_price_search_cache'),
    ('grocery_price_search_quota_claims'),
    ('grocery_price_search_events'),
    ('grocery_price_observations')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = expected.table_name
ORDER BY expected.table_name;

-- 2) RLS enabled
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'pass' ELSE 'fail' END AS status,
  'rls_enabled' AS check_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'grocery_price_search_cache',
    'grocery_price_search_quota_claims',
    'grocery_price_search_events',
    'grocery_price_observations'
  )
ORDER BY c.relname;

-- 3) Identity boundary: person_id -> people.id
SELECT
  tc.table_name,
  CASE
    WHEN ccu.table_name = 'people' AND ccu.column_name = 'id' THEN 'pass'
    ELSE 'fail'
  END AS status,
  'person_fk_people_id' AS check_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'grocery_price_search_events',
    'grocery_price_observations',
    'grocery_price_search_quota_claims'
  )
  AND kcu.column_name = 'person_id'
ORDER BY tc.table_name;

-- 4) Plan deletion durability: plan_id ON DELETE SET NULL
SELECT
  tc.table_name,
  CASE
    WHEN pg_get_constraintdef(con.oid) ILIKE '%ON DELETE SET NULL%' THEN 'pass'
    ELSE 'fail'
  END AS status,
  'plan_id_set_null_on_delete' AS check_type
FROM information_schema.table_constraints tc
JOIN pg_constraint con
  ON con.conname = tc.constraint_name
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('grocery_price_search_events', 'grocery_price_observations')
  AND kcu.column_name = 'plan_id'
ORDER BY tc.table_name;

-- 5) Quota claim lease column
SELECT
  'grocery_price_search_quota_claims' AS table_name,
  CASE WHEN c.column_name IS NOT NULL THEN 'pass' ELSE 'fail' END AS status,
  'quota_claim_expires_at_column' AS check_type
FROM (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'grocery_price_search_quota_claims'
    AND column_name = 'expires_at'
) c
RIGHT JOIN (SELECT 1) AS anchor ON true;

-- 6) Quota claim function present with lease + advisory lock semantics
SELECT
  'claim_grocery_price_search_quota' AS object_name,
  CASE
    WHEN p.proname IS NOT NULL
     AND pg_get_functiondef(p.oid) ILIKE '%pg_advisory_xact_lock%'
     AND pg_get_functiondef(p.oid) ILIKE '%p_claim_ttl_seconds%'
     AND pg_get_functiondef(p.oid) ILIKE '%expires_at <= now()%'
     AND pg_get_functiondef(p.oid) ILIKE '%expires_at > now()%'
    THEN 'pass'
    ELSE 'fail'
  END AS status,
  'quota_claim_function' AS check_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'claim_grocery_price_search_quota';

-- 7) Client write boundaries
SELECT
  pol.tablename AS table_name,
  pol.policyname,
  CASE
    WHEN pol.tablename = 'grocery_price_search_events'
     AND pol.cmd IN ('*', 'ALL') AND pol.qual = 'false' THEN 'pass'
    WHEN pol.tablename = 'grocery_price_observations' AND pol.cmd = 'SELECT' THEN 'pass'
    WHEN pol.tablename = 'grocery_price_observations' AND pol.cmd = 'INSERT' AND pol.with_check = 'false' THEN 'pass'
    WHEN pol.tablename = 'grocery_price_observations' AND pol.cmd = 'UPDATE' AND pol.qual = 'false' THEN 'pass'
    WHEN pol.tablename = 'grocery_price_observations' AND pol.cmd = 'DELETE' AND pol.qual = 'false' THEN 'pass'
    WHEN pol.tablename IN ('grocery_price_search_cache', 'grocery_price_search_quota_claims')
     AND pol.cmd IN ('*', 'ALL') AND pol.qual = 'false' THEN 'pass'
    ELSE 'fail'
  END AS status,
  'rls_policy' AS check_type
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN (
    'grocery_price_search_cache',
    'grocery_price_search_quota_claims',
    'grocery_price_search_events',
    'grocery_price_observations'
  )
ORDER BY pol.tablename, pol.policyname;

-- 8) Preview migration ledger entries
SELECT
  sm.version,
  sm.name,
  CASE
    WHEN sm.name = 'create_grocery_price_search_tables' THEN 'initial_truncated_apply'
    WHEN sm.name = 'create_grocery_price_search_tables_repair' THEN 'authoritative_schema_apply'
    ELSE 'unexpected'
  END AS ledger_role,
  'migration_ledger' AS check_type
FROM supabase_migrations.schema_migrations sm
WHERE sm.name IN (
  'create_grocery_price_search_tables',
  'create_grocery_price_search_tables_repair'
)
ORDER BY sm.version;

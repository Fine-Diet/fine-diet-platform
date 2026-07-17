-- Verification for grocery_ingredient_resolution_revocations (Preview/Production)

-- 1) Table exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'grocery_ingredient_resolution_revocations'
) AS table_exists;

-- 2) Unique (person_id, key) constraint
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.grocery_ingredient_resolution_revocations'::regclass
  AND contype = 'u';

-- 3) RLS enabled
SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.grocery_ingredient_resolution_revocations'::regclass;

-- 4) Self-only SELECT / INSERT / DELETE policies
SELECT polname, polcmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'grocery_ingredient_resolution_revocations'
ORDER BY polname;

-- Completely remove the admin-only publish trigger
-- Since API already enforces admin-only, the database trigger is redundant

-- Step 1: Find and list all triggers on question_set_pointers table
-- (This is informational - run separately if you want to see what exists)
-- SELECT 
--   tgname as trigger_name,
--   pg_get_triggerdef(oid) as trigger_definition
-- FROM pg_trigger
-- WHERE tgrelid = 'public.question_set_pointers'::regclass
--   AND tgisinternal = false;

-- Step 2: Drop ALL triggers on question_set_pointers (we'll recreate only the updated_at one)
-- This is safe because:
-- 1. updated_at trigger can be recreated (it's just for timestamps)
-- 2. admin-only publish trigger is redundant (API enforces it)
-- 3. We'll recreate the updated_at trigger below

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop all non-internal triggers on question_set_pointers
    FOR r IN (
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'public.question_set_pointers'::regclass 
          AND tgisinternal = false
          AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
    ) 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.tgname) || ' ON public.question_set_pointers';
        RAISE NOTICE 'Dropped trigger: %', r.tgname;
    END LOOP;
END $$;

-- Step 3: Recreate the updated_at trigger (if it was dropped)
DROP TRIGGER IF EXISTS trg_question_set_pointers_updated_at ON public.question_set_pointers;
CREATE TRIGGER trg_question_set_pointers_updated_at
BEFORE UPDATE ON public.question_set_pointers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Step 4: Drop the admin-only publish functions (cleanup)
-- Drop both function names we've seen in production
DROP FUNCTION IF EXISTS public.check_admin_only_publish();
DROP FUNCTION IF EXISTS public.enforce_admin_publish();

-- Note: API-level enforcement is still active in:
-- pages/api/admin/question-set-pointers/publish.ts
-- which uses requireRoleFromApi to check for admin role before allowing publish


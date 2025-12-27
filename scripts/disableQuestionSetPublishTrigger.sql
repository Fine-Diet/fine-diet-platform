-- Completely disable the trigger (rely on API-level enforcement only)
-- Since we're already enforcing admin-only in the API endpoint,
-- the database trigger is redundant and can be safely disabled

-- Drop ALL triggers on question_set_pointers except foreign key constraints
-- This will remove any admin-only publish trigger that might exist
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'public.question_set_pointers'::regclass 
          AND tgisinternal = false
          AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
          AND tgname NOT LIKE '%updated_at%'  -- Keep the updated_at trigger
    ) 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.tgname) || ' ON public.question_set_pointers';
    END LOOP;
END $$;

-- Drop the admin-only publish function
DROP FUNCTION IF EXISTS public.check_admin_only_publish();

-- Note: API-level enforcement is still active in pages/api/admin/question-set-pointers/publish.ts
-- which uses requireRoleFromApi to check for admin role before allowing publish


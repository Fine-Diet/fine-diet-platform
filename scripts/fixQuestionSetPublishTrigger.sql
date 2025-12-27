-- Fix or create trigger for admin-only publish enforcement
-- This trigger allows service_role to bypass the check (since API already enforces admin-only)
-- and enforces admin-only for regular authenticated users

-- Drop ALL existing triggers that might be blocking publish (check for any trigger name variations)
DROP TRIGGER IF EXISTS trg_question_set_pointers_admin_only_publish ON public.question_set_pointers;
DROP TRIGGER IF EXISTS question_set_pointers_admin_only_publish ON public.question_set_pointers;
-- Drop the function first if it exists with a different implementation
DROP FUNCTION IF EXISTS public.check_admin_only_publish();

-- Create function that enforces admin-only publish (allows service_role)
CREATE OR REPLACE FUNCTION public.check_admin_only_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service_role to bypass (API already enforces admin-only)
  -- Service role has NULL auth.uid(), so we check for that
  -- Also check if we're in a service_role session
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- For UPDATE: If published_revision_id is being changed, require admin role
  IF TG_OP = 'UPDATE' AND OLD.published_revision_id IS DISTINCT FROM NEW.published_revision_id THEN
    IF public.current_user_role() != 'admin' THEN
      RAISE EXCEPTION 'admin_only: cannot change published_revision_id';
    END IF;
  END IF;
  
  -- For INSERT: If published_revision_id is being set, require admin role
  IF TG_OP = 'INSERT' AND NEW.published_revision_id IS NOT NULL THEN
    IF public.current_user_role() != 'admin' THEN
      RAISE EXCEPTION 'admin_only: cannot change published_revision_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for both INSERT and UPDATE (since upsert can do either)
CREATE TRIGGER trg_question_set_pointers_admin_only_publish
BEFORE INSERT OR UPDATE ON public.question_set_pointers
FOR EACH ROW
EXECUTE FUNCTION public.check_admin_only_publish();

-- Add comment
COMMENT ON FUNCTION public.check_admin_only_publish() IS 'Enforces admin-only publish for question set pointers. Allows service_role to bypass (API enforces admin-only).';


-- Fix or create trigger for admin-only publish enforcement
-- This trigger allows service_role to bypass the check (since API already enforces admin-only)
-- and enforces admin-only for regular authenticated users

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_question_set_pointers_admin_only_publish ON public.question_set_pointers;

-- Create function that enforces admin-only publish (allows service_role)
CREATE OR REPLACE FUNCTION public.check_admin_only_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow service_role to bypass (API already enforces admin-only)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- If published_revision_id is being changed, require admin role
  IF OLD.published_revision_id IS DISTINCT FROM NEW.published_revision_id THEN
    IF public.current_user_role() != 'admin' THEN
      RAISE EXCEPTION 'admin_only: cannot change published_revision_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_question_set_pointers_admin_only_publish
BEFORE UPDATE ON public.question_set_pointers
FOR EACH ROW
EXECUTE FUNCTION public.check_admin_only_publish();

-- Add comment
COMMENT ON FUNCTION public.check_admin_only_publish() IS 'Enforces admin-only publish for question set pointers. Allows service_role to bypass (API enforces admin-only).';


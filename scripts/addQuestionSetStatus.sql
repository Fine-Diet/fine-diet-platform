-- Add status field to question_sets table
-- Allows archiving question sets without deleting them

-- 1) Create enum type for question set status
DO $$ BEGIN
  CREATE TYPE public.question_set_status AS ENUM ('active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add status column to question_sets (defaults to 'active' for existing rows)
ALTER TABLE public.question_sets
ADD COLUMN IF NOT EXISTS status public.question_set_status NOT NULL DEFAULT 'active';

-- 3) Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_question_sets_status 
ON public.question_sets (status);

-- 4) Add comment
COMMENT ON COLUMN public.question_sets.status IS 'Status of the question set: active (default) or archived. Archived question sets are hidden from normal operations but can be restored.';


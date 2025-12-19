-- Add unique constraint on webhook_outbox(submission_id, target)
-- Prevents duplicate webhook entries for the same submission and target

-- First, check if constraint already exists and drop any duplicates (idempotent)
DO $$ 
BEGIN
    -- Drop existing constraint if it exists with a different name
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'webhook_outbox_submission_target_unique'
        AND conrelid = 'public.webhook_outbox'::regclass
    ) THEN
        ALTER TABLE public.webhook_outbox 
        DROP CONSTRAINT webhook_outbox_submission_target_unique;
    END IF;
END $$;

-- Add unique constraint
ALTER TABLE public.webhook_outbox
ADD CONSTRAINT webhook_outbox_submission_target_unique 
UNIQUE (submission_id, target);

-- Add comment
COMMENT ON CONSTRAINT webhook_outbox_submission_target_unique ON public.webhook_outbox IS 
'Ensures only one webhook_outbox row per submission_id + target combination';


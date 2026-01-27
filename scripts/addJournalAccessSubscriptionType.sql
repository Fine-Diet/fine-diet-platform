-- ============================================================================
-- Add 'journal_access' to subscriptions.subscription_type CHECK constraint
-- Run this in Supabase Dashboard → SQL Editor if you have an existing
-- subscriptions table without 'journal_access' in the constraint.
-- ============================================================================

-- Step 1: Drop the existing constraint (get the actual constraint name first)
-- Run this query to find the constraint name:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c';

-- Then drop it (replace 'subscriptions_subscription_type_check' with actual name if different):
ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_subscription_type_check;

-- Step 2: Add the updated constraint with 'journal_access'
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_subscription_type_check
CHECK (subscription_type IN ('email_marketing', 'product_updates', 'program_waitlist', 'journal_access'));

-- Verify:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c';

-- ============================================================================
-- Additive offers columns for Stripe Payments v1
-- Run this in Supabase Dashboard → SQL Editor AFTER createStripeTables.sql
--
-- Adds Stripe-specific billing configuration columns to the existing offers table.
-- All columns are nullable or have defaults — existing offers are not broken.
-- ============================================================================

-- billing_model: how this offer is billed
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'one_time'
  CHECK (billing_model IN ('one_time', 'subscription', 'installment'));

COMMENT ON COLUMN public.offers.billing_model IS
  'How this offer is billed: one_time, subscription, or installment.';

-- stripe_price_id: the primary Stripe Price ID (for one_time and subscription)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

COMMENT ON COLUMN public.offers.stripe_price_id IS
  'Stripe Price ID for one_time or subscription offers. e.g. price_1Abc...';

-- stripe_phase_price_ids: array of Stripe Price IDs for installment phases
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS stripe_phase_price_ids TEXT[];

COMMENT ON COLUMN public.offers.stripe_phase_price_ids IS
  'Stripe Price IDs for each installment phase. e.g. {price_phase1, price_phase2}. Used when billing_model = installment.';

-- stripe_phase_iterations: cycles per phase for installment schedules
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS stripe_phase_iterations INT[];

COMMENT ON COLUMN public.offers.stripe_phase_iterations IS
  'Number of billing cycles per installment phase. Must align with stripe_phase_price_ids. e.g. {1, 1} or {3}.';

-- success_path: where to redirect after successful checkout
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS success_path TEXT;

COMMENT ON COLUMN public.offers.success_path IS
  'Relative path to redirect to after successful Stripe checkout. App subscription offers should use /app/onboarding (NOT /home). Defaults to /app/onboarding if null.';

-- cancel_path: where to redirect if checkout is canceled
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS cancel_path TEXT;

COMMENT ON COLUMN public.offers.cancel_path IS
  'Relative path to redirect to if Stripe checkout is canceled. App subscription offers should use /start or /start/<offerSlug> (NOT /shop; /shop is reserved for physical commerce). Defaults to /start if null.';

-- trial_period_days: optional card-required free-trial length for subscription offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER
  CHECK (trial_period_days IS NULL OR trial_period_days >= 0);

COMMENT ON COLUMN public.offers.trial_period_days IS
  'Card-required free-trial length (days) for subscription offers. NULL or 0 = charge immediately, no trial. Read by /api/checkout/create and passed to Stripe subscription_data.trial_period_days.';


-- ============================================================================
-- Verification
-- ============================================================================

-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'offers'
-- ORDER BY ordinal_position;

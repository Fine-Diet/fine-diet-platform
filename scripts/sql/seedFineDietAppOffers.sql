-- ============================================================================
-- Seed: Fine Diet app subscription offers (METHOD + Founder's Launch)
-- Run in Supabase Dashboard -> SQL Editor.
--
-- Source of truth: Supabase `offers` rows define billing; Stripe Price IDs are
-- payment-rail references only. Pricing follows the Revenue Strategy sheet
-- ("REVENUE STRATEGY -- Fine Diet"):
--   - METHOD monthly  = $24.99/mo  (14-day card-required trial)
--   - METHOD annual   = $199.99/yr (immediate charge, no trial)
--   - FOUNDER'S LAUNCH = $129.99/yr (30-day card-required trial)
--
-- This script is IDEMPOTENT and safe to rerun. It is also SELF-CONTAINED: it
-- defensively ensures the required Stripe/billing columns exist so it does not
-- depend on any local-only / unapplied migration state.
--
-- Stripe sandbox Price IDs referenced here:
--   METHOD monthly        : price_1TeqtSARcbgSDadAsYHKrUMC
--   METHOD annual         : price_1TeqtlARcbgSDadACTTRYdaA
--   Founder launch annual : price_1TequOARcbgSDadAU4olnYXJ
-- ============================================================================

-- 0) Defensive, additive schema guards (no-ops if already applied) -----------
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'one_time';
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS success_path TEXT;
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS cancel_path TEXT;
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER;

-- 1) Upsert the three app subscription offers --------------------------------
INSERT INTO public.offers (
  offer_key,
  name,
  description,
  is_active,
  purchase_provider,
  billing_model,
  stripe_price_id,
  success_path,
  cancel_path,
  trial_period_days
)
VALUES
  (
    'fine-diet-method-monthly',
    'Fine Diet Method Monthly',
    'Standard Fine Diet app + programs subscription (monthly).',
    true,
    'stripe',
    'subscription',
    'price_1TeqtSARcbgSDadAsYHKrUMC',
    '/app/onboarding',
    '/start/fine-diet-app',
    14
  ),
  (
    'fine-diet-method-annual',
    'Fine Diet Method Annual',
    'Annual Fine Diet app + programs subscription.',
    true,
    'stripe',
    'subscription',
    'price_1TeqtlARcbgSDadACTTRYdaA',
    '/app/onboarding',
    '/start/buy-now',
    NULL
  ),
  (
    'fine-diet-founder-launch-annual',
    'Fine Diet Founder Launch Annual',
    'Founder launch annual Fine Diet app + programs subscription.',
    true,
    'stripe',
    'subscription',
    'price_1TequOARcbgSDadAU4olnYXJ',
    '/app/onboarding',
    '/start/launch',
    30
  )
ON CONFLICT (offer_key) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  is_active         = EXCLUDED.is_active,
  purchase_provider = EXCLUDED.purchase_provider,
  billing_model     = EXCLUDED.billing_model,
  stripe_price_id   = EXCLUDED.stripe_price_id,
  success_path      = EXCLUDED.success_path,
  cancel_path       = EXCLUDED.cancel_path,
  trial_period_days = EXCLUDED.trial_period_days,
  updated_at        = NOW();

-- 2) Entitlement mappings (each app offer grants journal + program:baseline) --
-- Reactivate any pre-existing inactive mapping first (defensive; new offers
-- will have none), then upsert active mappings via the partial unique index
-- (offer_key, entitlement_key) WHERE is_active = true.
UPDATE public.offer_entitlements
SET is_active = true,
    duration_days = NULL,
    updated_at = NOW()
WHERE is_active = false
  AND offer_key IN (
    'fine-diet-method-monthly',
    'fine-diet-method-annual',
    'fine-diet-founder-launch-annual'
  )
  AND entitlement_key IN ('journal', 'program:baseline');

INSERT INTO public.offer_entitlements (
  offer_key,
  entitlement_key,
  duration_days,
  is_active
)
VALUES
  ('fine-diet-method-monthly',        'journal',          NULL, true),
  ('fine-diet-method-monthly',        'program:baseline', NULL, true),
  ('fine-diet-method-annual',         'journal',          NULL, true),
  ('fine-diet-method-annual',         'program:baseline', NULL, true),
  ('fine-diet-founder-launch-annual', 'journal',          NULL, true),
  ('fine-diet-founder-launch-annual', 'program:baseline', NULL, true)
ON CONFLICT (offer_key, entitlement_key) WHERE is_active = true
DO UPDATE SET
  duration_days = EXCLUDED.duration_days,
  is_active     = true,
  updated_at    = NOW();

-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT offer_key, billing_model, stripe_price_id, success_path, cancel_path,
--        trial_period_days, is_active
-- FROM public.offers
-- WHERE offer_key IN (
--   'fine-diet-method-monthly',
--   'fine-diet-method-annual',
--   'fine-diet-founder-launch-annual'
-- )
-- ORDER BY offer_key;
--
-- SELECT offer_key, entitlement_key, duration_days, is_active
-- FROM public.offer_entitlements
-- WHERE offer_key IN (
--   'fine-diet-method-monthly',
--   'fine-diet-method-annual',
--   'fine-diet-founder-launch-annual'
-- )
-- ORDER BY offer_key, entitlement_key;

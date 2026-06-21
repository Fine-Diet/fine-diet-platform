-- ============================================================================
-- Seed: Fine Diet durable pricing model (parent offer + price options)
-- Run in Supabase Dashboard -> SQL Editor, AFTER createPriceOptionsTable.sql.
--
-- Introduces the durable spine:
--   offer_key        = 'fine-diet-method'  (the marketed package + entitlements)
--   price_option_key = 'fine-diet-method-monthly'        ($24.99/mo, 14d trial)
--   price_option_key = 'fine-diet-method-annual'         ($199.99/yr, no trial)
--   price_option_key = 'fine-diet-method-founder-annual' ($129.99/yr, 30d trial)
--
-- Billing truth (Stripe Price IDs) lives on price_options. Entitlements are tied
-- to the parent offer 'fine-diet-method' (NOT per price option / card).
--
-- COMPATIBILITY: the legacy per-variant offers rows
--   ('fine-diet-method-monthly', 'fine-diet-method-annual',
--    'fine-diet-founder-launch-annual') and their offer_entitlements mappings are
-- intentionally LEFT UNTOUCHED so existing offer_key-only checkout keeps working.
--
-- This script is IDEMPOTENT and safe to rerun.
--
-- Stripe sandbox Price IDs (reference-only; truth is these DB rows):
--   METHOD monthly        : price_1TeqtSARcbgSDadAsYHKrUMC
--   METHOD annual         : price_1TeqtlARcbgSDadACTTRYdaA
--   Founder launch annual : price_1TequOARcbgSDadAU4olnYXJ
-- ============================================================================

-- 1) Parent offer: the marketed package (no Stripe price of its own; the price
--    options carry billing). billing_model on the parent is informational.
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
VALUES (
  'fine-diet-method',
  'Fine Diet Method',
  'The full Fine Diet app and programs. Buy monthly, annual, or founder annual — all unlock the same access.',
  true,
  'stripe',
  'subscription',
  NULL,
  '/app/onboarding',
  '/start',
  NULL
)
ON CONFLICT (offer_key) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  is_active         = EXCLUDED.is_active,
  purchase_provider = EXCLUDED.purchase_provider,
  success_path      = EXCLUDED.success_path,
  cancel_path       = EXCLUDED.cancel_path,
  updated_at        = NOW();

-- 2) Entitlement mappings for the parent offer (journal + program:baseline).
--    Reactivate any inactive mapping first, then upsert active mappings via the
--    partial unique index (offer_key, entitlement_key) WHERE is_active = true.
UPDATE public.offer_entitlements
SET is_active = true,
    duration_days = NULL,
    updated_at = NOW()
WHERE is_active = false
  AND offer_key = 'fine-diet-method'
  AND entitlement_key IN ('journal', 'program:baseline');

INSERT INTO public.offer_entitlements (
  offer_key,
  entitlement_key,
  duration_days,
  is_active
)
VALUES
  ('fine-diet-method', 'journal',          NULL, true),
  ('fine-diet-method', 'program:baseline', NULL, true)
ON CONFLICT (offer_key, entitlement_key) WHERE is_active = true
DO UPDATE SET
  duration_days = EXCLUDED.duration_days,
  is_active     = true,
  updated_at    = NOW();

-- 3) Price options for the parent offer (billing truth).
INSERT INTO public.price_options (
  price_option_key,
  offer_key,
  name,
  is_active,
  billing_model,
  stripe_price_id,
  trial_period_days,
  sort_order
)
VALUES
  (
    'fine-diet-method-monthly',
    'fine-diet-method',
    'Fine Diet Method — Monthly',
    true,
    'subscription',
    'price_1TeqtSARcbgSDadAsYHKrUMC',
    14,
    10
  ),
  (
    'fine-diet-method-annual',
    'fine-diet-method',
    'Fine Diet Method — Annual',
    true,
    'subscription',
    'price_1TeqtlARcbgSDadACTTRYdaA',
    NULL,
    20
  ),
  (
    'fine-diet-method-founder-annual',
    'fine-diet-method',
    'Fine Diet Method — Founder Annual',
    true,
    'subscription',
    'price_1TequOARcbgSDadAU4olnYXJ',
    30,
    30
  )
ON CONFLICT (price_option_key) DO UPDATE SET
  offer_key         = EXCLUDED.offer_key,
  name              = EXCLUDED.name,
  is_active         = EXCLUDED.is_active,
  billing_model     = EXCLUDED.billing_model,
  stripe_price_id   = EXCLUDED.stripe_price_id,
  trial_period_days = EXCLUDED.trial_period_days,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = NOW();

-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT price_option_key, offer_key, billing_model, stripe_price_id,
--        trial_period_days, is_active, sort_order
-- FROM public.price_options
-- WHERE offer_key = 'fine-diet-method'
-- ORDER BY sort_order;
--
-- SELECT offer_key, entitlement_key, is_active
-- FROM public.offer_entitlements
-- WHERE offer_key = 'fine-diet-method'
-- ORDER BY entitlement_key;

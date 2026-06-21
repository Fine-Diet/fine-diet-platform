-- ============================================================================
-- Price options durable model: public.price_options
-- Run this in Supabase Dashboard -> SQL Editor.
--
-- SOURCE-OF-TRUTH BOUNDARY:
--   - `offers` rows = the MARKETED PACKAGE (what is sold) + entitlement mappings.
--   - `price_options` rows = ONE selectable way to BUY an offer (how you pay).
--     This is the BILLING truth: Stripe Price IDs, trial, and phase data live
--     here and are read ONLY server-side at checkout. They are NEVER serialized
--     into any client DTO.
--
-- A price option belongs to exactly one offer (offer_key FK). Many price options
-- can map to the same offer (monthly, annual, founder annual, intro, ...), and
-- they all grant the SAME access because entitlements are tied to the offer, not
-- the price option / visual card.
--
-- Hard rules (mirror createStripeTables.sql):
--   - Additive only / idempotent: safe to rerun.
--   - RLS deny-by-default: service role manages; authenticated can read active.
-- ============================================================================

-- ============================================================================
-- A) price_options
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_options (
  price_option_key TEXT PRIMARY KEY,            -- e.g. 'fine-diet-method-annual'
  offer_key TEXT NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- How this price option is billed.
  billing_model TEXT NOT NULL DEFAULT 'subscription'
    CHECK (billing_model IN (
      'one_time',
      'subscription',
      'installment',
      'intro_then_subscription'
    )),

  -- one_time / subscription: the primary Stripe Price ID.
  -- Also used as the renewal price for intro_then_subscription when
  -- renewal_price_id is not set.
  stripe_price_id TEXT,

  -- installment: aligned phase prices + iterations.
  stripe_phase_price_ids TEXT[],
  stripe_phase_iterations INT[],

  -- intro_then_subscription: an intro phase that runs for a fixed number of
  -- iterations, then continues on a normal recurring renewal price until
  -- canceled.
  intro_price_id TEXT,
  intro_iterations INT CHECK (intro_iterations IS NULL OR intro_iterations > 0),
  renewal_price_id TEXT,

  -- Card-required free-trial length (days) for subscription-style options.
  -- NULL or 0 = charge immediately, no trial.
  trial_period_days INTEGER
    CHECK (trial_period_days IS NULL OR trial_period_days >= 0),

  -- Display ordering for pricing modules (ascending).
  sort_order INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.price_options IS
  'One selectable way to buy an offer (billing truth). Stripe Price IDs live here and are read server-side only. Entitlements are tied to the parent offer, not the price option.';
COMMENT ON COLUMN public.price_options.offer_key IS
  'Parent offer (marketed package) this price option buys. Entitlements are granted from the offer, not the price option.';
COMMENT ON COLUMN public.price_options.billing_model IS
  'one_time, subscription, installment, or intro_then_subscription.';
COMMENT ON COLUMN public.price_options.intro_price_id IS
  'intro_then_subscription: Stripe Price ID charged during the intro phase.';
COMMENT ON COLUMN public.price_options.intro_iterations IS
  'intro_then_subscription: number of billing cycles the intro phase runs before renewal.';
COMMENT ON COLUMN public.price_options.renewal_price_id IS
  'intro_then_subscription: normal recurring Stripe Price ID that continues until canceled. Falls back to stripe_price_id when null.';

-- Lookup: "what price options does offer X have?" (active, ordered)
CREATE INDEX IF NOT EXISTS idx_price_options_offer
  ON public.price_options (offer_key, is_active, sort_order);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_price_options_updated_at ON public.price_options;
CREATE TRIGGER trg_price_options_updated_at
  BEFORE UPDATE ON public.price_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.price_options ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (API routes use supabaseAdmin)
DROP POLICY IF EXISTS "Service role can manage price_options" ON public.price_options;
CREATE POLICY "Service role can manage price_options"
  ON public.price_options FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: authenticated users can read active price options (for purchase UI).
-- NOTE: client reads still must NOT receive Stripe Price IDs; the app projects
-- a safe DTO. This policy exists for parity with offers, not to expose price IDs.
DROP POLICY IF EXISTS "Authenticated can read active price_options" ON public.price_options;
CREATE POLICY "Authenticated can read active price_options"
  ON public.price_options
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Grants
GRANT SELECT ON public.price_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_options TO service_role;


-- ============================================================================
-- B) Additive: record which price option a purchase used.
-- ============================================================================

ALTER TABLE public.stripe_offer_instances
  ADD COLUMN IF NOT EXISTS price_option_key TEXT;

COMMENT ON COLUMN public.stripe_offer_instances.price_option_key IS
  'Which price_options.price_option_key the buyer selected (how they paid). NULL for legacy offer_key-only checkouts.';


-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT price_option_key, offer_key, billing_model, stripe_price_id,
--        trial_period_days, is_active, sort_order
-- FROM public.price_options
-- ORDER BY offer_key, sort_order;

-- ============================================================================
-- Stripe Payments v1: stripe_customers, stripe_events, stripe_offer_instances
-- Run this in Supabase Dashboard -> SQL Editor
--
-- Prerequisites:
--   - public.people table exists
--   - public.offers table exists (from createAccessManagementTables.sql)
--   - public.set_updated_at() trigger function exists
--   - public.current_user_role() function exists
--
-- Hard rules:
--   - Additive only: no existing tables are modified
--   - RLS deny-by-default: every table has ENABLE ROW LEVEL SECURITY
--   - Service role can always manage all (for API routes that use supabaseAdmin)
-- ============================================================================


-- ============================================================================
-- A) stripe_customers
-- Maps people to Stripe customer IDs. One Stripe customer per person.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_customers (
  person_id UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON public.stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON public.stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (webhooks + API routes use supabaseAdmin)
CREATE POLICY "Service role can manage stripe_customers"
  ON public.stripe_customers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: admin/editor can read all
CREATE POLICY "Admin/editor can read stripe_customers"
  ON public.stripe_customers
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Policy: user can read own
CREATE POLICY "User can read own stripe_customer"
  ON public.stripe_customers
  FOR SELECT
  TO authenticated
  USING (
    person_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.stripe_customers IS 'Maps people to Stripe customer IDs. One row per person.';

-- Grants
GRANT SELECT ON public.stripe_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_customers TO service_role;


-- ============================================================================
-- B) stripe_events
-- Webhook idempotency: records every processed Stripe event by ID.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload JSONB
);

-- Enable RLS (deny-by-default)
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Policy: service role only
CREATE POLICY "Service role can manage stripe_events"
  ON public.stripe_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.stripe_events IS 'Webhook idempotency log. One row per Stripe event processed.';

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_events TO service_role;


-- ============================================================================
-- C) stripe_offer_instances
-- Durable mapping: person + offer + Stripe objects.
-- Tracks the lifecycle of a purchase from checkout to completion/cancellation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_offer_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  offer_key TEXT NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ended', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stripe_offer_instances_person
  ON public.stripe_offer_instances (person_id);

CREATE INDEX IF NOT EXISTS idx_stripe_offer_instances_offer
  ON public.stripe_offer_instances (offer_key);

CREATE INDEX IF NOT EXISTS idx_stripe_offer_instances_subscription
  ON public.stripe_offer_instances (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_stripe_offer_instances_updated_at ON public.stripe_offer_instances;
CREATE TRIGGER trg_stripe_offer_instances_updated_at
  BEFORE UPDATE ON public.stripe_offer_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.stripe_offer_instances ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access
CREATE POLICY "Service role can manage stripe_offer_instances"
  ON public.stripe_offer_instances FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: admin/editor can read all
CREATE POLICY "Admin/editor can read stripe_offer_instances"
  ON public.stripe_offer_instances
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.stripe_offer_instances IS 'Tracks each purchase: person + offer + Stripe checkout/subscription/payment lifecycle.';

-- Grants
GRANT SELECT ON public.stripe_offer_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_offer_instances TO service_role;


-- ============================================================================
-- Verification Queries (run after migration to confirm)
-- ============================================================================

-- Check all three tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('stripe_customers', 'stripe_events', 'stripe_offer_instances');

-- Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('stripe_customers', 'stripe_events', 'stripe_offer_instances');

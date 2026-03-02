-- ============================================================
-- Checkout Tracking: checkout_events table
-- Run in Supabase SQL Editor (additive, idempotent, safe to re-run)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.checkout_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL CHECK (event_type IN ('checkout_started', 'checkout_completed', 'checkout_failed')),
  person_id   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  offer_key   TEXT,
  placement   TEXT,
  source      TEXT,
  session_id  TEXT,
  utm_source  TEXT,
  utm_medium  TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term    TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  stripe_checkout_session_id TEXT,
  stripe_subscription_id     TEXT,
  stripe_payment_intent_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_checkout_events_person ON public.checkout_events(person_id);
CREATE INDEX IF NOT EXISTS idx_checkout_events_offer  ON public.checkout_events(offer_key);
CREATE INDEX IF NOT EXISTS idx_checkout_events_type   ON public.checkout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_checkout_events_stripe ON public.checkout_events(stripe_checkout_session_id);

-- RLS
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;

-- A) service_role: full access
DROP POLICY IF EXISTS checkout_events_service_full ON public.checkout_events;
DROP POLICY IF EXISTS checkout_events_service_role_all ON public.checkout_events;
CREATE POLICY checkout_events_service_role_all ON public.checkout_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B) admin/editor: read only (uses public.current_user_role())
DROP POLICY IF EXISTS checkout_events_admin_select ON public.checkout_events;
CREATE POLICY checkout_events_admin_select ON public.checkout_events
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Grants
GRANT SELECT ON public.checkout_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkout_events TO service_role;

-- ============================================================
-- Verification queries (uncomment to check after running)
-- ============================================================
-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public' AND tablename = 'checkout_events';
--
-- SELECT policyname, permissive, roles, cmd, qual
--   FROM pg_policies
--  WHERE tablename = 'checkout_events';

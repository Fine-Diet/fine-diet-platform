-- ============================================================================
-- People System Tables
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- Creates: people, subscriptions, people_events tables
-- Used by: waitlist, newsletter, journal access gating, n8n webhooks
-- ============================================================================

-- ============================================================================
-- people
-- Central contact/lead table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'marketing_only'
    CHECK (status IN ('marketing_only', 'waitlist', 'active_user', 'inactive_user', 'unsubscribed', 'blocked')),
  primary_source TEXT,
  last_source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  email_marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  email_opt_in_at TIMESTAMPTZ,
  sms_marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  sms_opt_in_at TIMESTAMPTZ,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email uniqueness (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_email_lower ON public.people (LOWER(email));

-- Index for auth_user_id lookups (used by journal gating)
CREATE INDEX IF NOT EXISTS idx_people_auth_user_id ON public.people (auth_user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_people_status ON public.people (status);

-- Enable RLS
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- Service role can manage all
CREATE POLICY "Service role can manage people"
  ON public.people FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- subscriptions
-- Tracks what a person is subscribed to (newsletters, waitlists, entitlements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL
    CHECK (subscription_type IN ('email_marketing', 'product_updates', 'program_waitlist', 'journal_access')),
  program_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for upsert (person + type + program)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_unique
  ON public.subscriptions (person_id, subscription_type, COALESCE(program_slug, ''));

-- Index for active subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON public.subscriptions (person_id, subscription_type, is_active);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role can manage all
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- people_events
-- Audit log of actions (signups, status changes, emails sent, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.people_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('newsletter_signup', 'waitlist_join', 'status_change', 'profile_update', 'email_sent', 'sms_sent', 'unsubscribed', 'other')),
  source TEXT,
  channel TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for person event history
CREATE INDEX IF NOT EXISTS idx_people_events_person ON public.people_events (person_id, created_at DESC);

-- Index for event type queries
CREATE INDEX IF NOT EXISTS idx_people_events_type ON public.people_events (event_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.people_events ENABLE ROW LEVEL SECURITY;

-- Service role can manage all
CREATE POLICY "Service role can manage people_events"
  ON public.people_events FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE public.people IS 'Central contact/lead table for waitlist, newsletter, and user management.';
COMMENT ON TABLE public.subscriptions IS 'Subscription/entitlement records. subscription_type: email_marketing, product_updates, program_waitlist, journal_access.';
COMMENT ON TABLE public.people_events IS 'Audit log of person-related events (signups, status changes, etc.).';

-- ============================================================================
-- Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_events TO service_role;

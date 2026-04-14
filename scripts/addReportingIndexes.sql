-- ============================================================================
-- Reporting indexes
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- Timeline queries for a single person's event history.
-- Most common reporting pattern: "show all events for person X in date order."
CREATE INDEX IF NOT EXISTS idx_people_events_person_timeline
  ON public.people_events (person_id, created_at);

-- Aggregate event-type queries for funnel / source analysis.
-- Supports: SELECT count(*), source FROM people_events WHERE event_type = '...' GROUP BY source
CREATE INDEX IF NOT EXISTS idx_people_events_type_source
  ON public.people_events (event_type, source);

-- List-size reporting: count active subscribers by subscription type.
-- Supports: SELECT count(*) FROM subscriptions WHERE subscription_type = 'email_marketing' AND is_active = true
CREATE INDEX IF NOT EXISTS idx_subscriptions_type_active
  ON public.subscriptions (subscription_type, is_active);

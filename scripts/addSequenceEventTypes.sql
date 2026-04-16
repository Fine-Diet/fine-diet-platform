-- ============================================================================
-- Add Fine Print nurture sequence event types to people_events
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- Drop both possible constraint names (IF EXISTS makes the missing one a no-op)
ALTER TABLE public.people_events
  DROP CONSTRAINT IF EXISTS people_events_type_check;
ALTER TABLE public.people_events
  DROP CONSTRAINT IF EXISTS people_events_event_type_check;

-- Re-add with all types, including new sequence tracking types
ALTER TABLE public.people_events
  ADD CONSTRAINT people_events_event_type_check
  CHECK (event_type IN (
    -- core lifecycle
    'newsletter_signup',
    'waitlist_join',
    'status_change',
    'profile_update',
    'email_sent',
    'sms_sent',
    'unsubscribed',
    'preference_update',
    -- Fine Print signup (already live)
    'fine_print_signup',
    -- Fine Print nurture sequence tracking (new)
    'fine_print_sequence_started',
    'fine_print_email_1_sent',
    'fine_print_email_2_sent',
    'fine_print_email_3_sent',
    'fine_print_sequence_completed',
    -- fallback
    'other'
  ));

-- ============================================================================
-- Reporting index: fast lookup of sequence completions per person
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_people_events_sequence_completed
  ON public.people_events (person_id, event_type)
  WHERE event_type = 'fine_print_sequence_completed';

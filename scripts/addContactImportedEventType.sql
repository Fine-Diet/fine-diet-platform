-- ============================================================================
-- Add contact_imported event type to people_events CHECK constraint
-- ============================================================================
-- Applied via Supabase MCP on 2026-04-14.
-- Adds 'contact_imported' to the allowed event_type values for people_events,
-- used when migrating contacts from external platforms (e.g. Klaviyo).
-- ============================================================================

ALTER TABLE public.people_events
  DROP CONSTRAINT IF EXISTS people_events_event_type_check;

ALTER TABLE public.people_events
  ADD CONSTRAINT people_events_event_type_check
  CHECK (event_type IN (
    'newsletter_signup',
    'waitlist_join',
    'status_change',
    'profile_update',
    'email_sent',
    'sms_sent',
    'unsubscribed',
    'preference_update',
    'fine_print_signup',
    'fine_print_sequence_started',
    'fine_print_email_1_sent',
    'fine_print_email_2_sent',
    'fine_print_email_3_sent',
    'fine_print_sequence_completed',
    'fine_print_editorial_sent',
    'contact_imported',
    'other'
  ));

-- Index for querying imported contacts
CREATE INDEX IF NOT EXISTS idx_people_events_contact_imported
  ON public.people_events (person_id, created_at)
  WHERE event_type = 'contact_imported';

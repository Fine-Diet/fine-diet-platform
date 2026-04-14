-- ============================================================================
-- Extend people_events.event_type CHECK constraint
-- Adds: 'fine_print_signup', 'preference_update'
--
-- To find the current constraint name before running:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.people_events'::regclass AND contype = 'c';
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
    'fine_print_signup',
    'preference_update',
    'other'
  ));

-- Verify:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.people_events'::regclass AND contype = 'c';

-- ============================================================================
-- Post-Nurture Audience Query — Fine Print
-- ============================================================================
-- A person is "post-nurture eligible" when ALL four conditions are true:
--
--   1. fine_print_sequence_completed event exists
--   2. email_preferences.unsubscribe_all_at IS NULL  (not globally unsubscribed)
--   3. subscriptions.email_marketing IS active
--   4. email_preferences.nutrition_insights = true   (relevant Fine Print pref)
--
-- Run in Supabase SQL Editor to preview the audience.
-- For production use, wrap as a view or call from the app.
-- ============================================================================

SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.primary_source,
  seq.completed_at
FROM public.people p

-- Condition 1: sequence completed
INNER JOIN LATERAL (
  SELECT created_at AS completed_at
  FROM public.people_events
  WHERE person_id = p.id
    AND event_type = 'fine_print_sequence_completed'
  ORDER BY created_at DESC
  LIMIT 1
) seq ON TRUE

-- Condition 2: not globally unsubscribed
INNER JOIN public.email_preferences ep
  ON ep.person_id = p.id
  AND ep.unsubscribe_all_at IS NULL

-- Condition 3: active email_marketing subscription
INNER JOIN public.subscriptions sub
  ON sub.person_id = p.id
  AND sub.subscription_type = 'email_marketing'
  AND sub.is_active = TRUE

-- Condition 4: Fine Print preference still enabled
WHERE ep.nutrition_insights = TRUE

ORDER BY seq.completed_at DESC;


-- ============================================================================
-- Quick count
-- ============================================================================

/*
SELECT COUNT(*)
FROM public.people p
INNER JOIN LATERAL (
  SELECT 1
  FROM public.people_events
  WHERE person_id = p.id AND event_type = 'fine_print_sequence_completed'
  LIMIT 1
) seq ON TRUE
INNER JOIN public.email_preferences ep
  ON ep.person_id = p.id AND ep.unsubscribe_all_at IS NULL
INNER JOIN public.subscriptions sub
  ON sub.person_id = p.id
  AND sub.subscription_type = 'email_marketing'
  AND sub.is_active = TRUE
WHERE ep.nutrition_insights = TRUE;
*/


-- ============================================================================
-- Where someone is in the sequence right now (for support / debugging)
-- ============================================================================

/*
-- Replace :person_id with the UUID you want to inspect
SELECT event_type, created_at, metadata
FROM public.people_events
WHERE person_id = :person_id
  AND event_type LIKE 'fine_print_%'
ORDER BY created_at ASC;
*/


-- ============================================================================
-- Find anyone who started but did NOT complete (stopped by unsubscribe)
-- ============================================================================

/*
SELECT DISTINCT p.id, p.email, p.first_name
FROM public.people p
INNER JOIN public.people_events started
  ON started.person_id = p.id
  AND started.event_type = 'fine_print_sequence_started'
LEFT JOIN public.people_events completed
  ON completed.person_id = p.id
  AND completed.event_type = 'fine_print_sequence_completed'
WHERE completed.id IS NULL
ORDER BY p.email;
*/

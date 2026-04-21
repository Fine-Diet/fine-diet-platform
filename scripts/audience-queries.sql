-- ============================================================================
-- Fine Diet — Audience & List Health Queries
-- ============================================================================
-- Run these in Supabase SQL Editor for operational counts, segment checks,
-- and pre-send sanity verification.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. TOTAL LIST SIZE
-- ----------------------------------------------------------------------------

SELECT COUNT(*) AS total_contacts
FROM public.people;

-- Breakdown: reachable vs globally unsubscribed
SELECT
  COUNT(*)                                               AS total,
  COUNT(*) FILTER (WHERE ep.unsubscribe_all_at IS NULL)  AS reachable,
  COUNT(*) FILTER (WHERE ep.unsubscribe_all_at IS NOT NULL) AS globally_unsubscribed
FROM public.people p
JOIN public.email_preferences ep ON ep.person_id = p.id;


-- ----------------------------------------------------------------------------
-- 2. SEGMENT COUNTS
-- (all counts exclude globally unsubscribed)
-- ----------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE ep.unsubscribe_all_at IS NULL)
    AS reachable_total,
  COUNT(*) FILTER (WHERE ep.nutrition_insights  = true AND ep.unsubscribe_all_at IS NULL)
    AS fine_print_eligible,
  COUNT(*) FILTER (WHERE ep.product_updates     = true AND ep.unsubscribe_all_at IS NULL)
    AS product_updates_eligible,
  COUNT(*) FILTER (WHERE ep.program_offers      = true AND ep.unsubscribe_all_at IS NULL)
    AS program_offers_eligible,
  COUNT(*) FILTER (WHERE ep.early_access        = true AND ep.unsubscribe_all_at IS NULL)
    AS early_access_eligible
FROM public.people p
JOIN public.email_preferences ep ON ep.person_id = p.id;


-- ----------------------------------------------------------------------------
-- 3. SEND-READY AUDIENCE SIZES
-- (use before triggering editorial or product update sends)
-- ----------------------------------------------------------------------------

-- Fine Print editorial — requires nurture completion + active email_marketing sub
SELECT COUNT(*) AS fine_print_editorial_audience
FROM public.v_fine_print_editorial_audience;

-- Product Updates — requires product_updates=true, not globally unsubscribed
SELECT COUNT(*) AS product_updates_audience
FROM public.v_product_updates_audience;


-- ----------------------------------------------------------------------------
-- 4. SIGNUPS BY SOURCE
-- ----------------------------------------------------------------------------

SELECT
  COALESCE(primary_source, '(none)') AS source,
  COUNT(*)                           AS contacts
FROM public.people
GROUP BY primary_source
ORDER BY contacts DESC;


-- ----------------------------------------------------------------------------
-- 5. NEW CONTACTS BY WEEK (last 12 weeks)
-- ----------------------------------------------------------------------------

SELECT
  DATE_TRUNC('week', created_at)::date AS week,
  COUNT(*)                             AS new_contacts
FROM public.people
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;


-- ----------------------------------------------------------------------------
-- 6. FINE PRINT NURTURE PIPELINE
-- ----------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE event_type = 'fine_print_signup')             AS total_signups,
  COUNT(*) FILTER (WHERE event_type = 'fine_print_sequence_started')   AS sequence_started,
  COUNT(*) FILTER (WHERE event_type = 'fine_print_email_1_sent')       AS email_1_sent,
  COUNT(*) FILTER (WHERE event_type = 'fine_print_email_2_sent')       AS email_2_sent,
  COUNT(*) FILTER (WHERE event_type = 'fine_print_email_3_sent')       AS email_3_sent,
  COUNT(*) FILTER (WHERE event_type = 'fine_print_sequence_completed') AS sequence_completed
FROM public.people_events;


-- ----------------------------------------------------------------------------
-- 7. UNSUBSCRIBES
-- ----------------------------------------------------------------------------

-- Global unsubscribes with timestamp
SELECT
  p.email,
  ep.unsubscribe_all_at
FROM public.people p
JOIN public.email_preferences ep ON ep.person_id = p.id
WHERE ep.unsubscribe_all_at IS NOT NULL
ORDER BY ep.unsubscribe_all_at DESC;

-- Unsubscribe events log
SELECT
  pe.created_at,
  p.email,
  pe.metadata
FROM public.people_events pe
JOIN public.people p ON p.id = pe.person_id
WHERE pe.event_type = 'unsubscribed'
ORDER BY pe.created_at DESC;


-- ----------------------------------------------------------------------------
-- 8. IMPORTED CONTACTS
-- ----------------------------------------------------------------------------

SELECT
  COUNT(DISTINCT person_id) AS imported_people,
  COUNT(*)                  AS import_events,
  MIN(created_at)           AS first_import,
  MAX(created_at)           AS last_import
FROM public.people_events
WHERE event_type = 'contact_imported';

-- Breakdown by import metadata source
SELECT
  metadata->>'source'   AS import_source,
  COUNT(DISTINCT person_id) AS people
FROM public.people_events
WHERE event_type = 'contact_imported'
GROUP BY metadata->>'source'
ORDER BY people DESC;


-- ----------------------------------------------------------------------------
-- 9. CONTACTS NOT YET IN ANY SEGMENT
-- (people with email_preferences but no interest flags set)
-- ----------------------------------------------------------------------------

SELECT COUNT(*) AS no_segment
FROM public.people p
JOIN public.email_preferences ep ON ep.person_id = p.id
WHERE ep.unsubscribe_all_at IS NULL
  AND ep.nutrition_insights  = false
  AND ep.product_updates     = false
  AND ep.program_offers      = false
  AND ep.early_access        = false;


-- ----------------------------------------------------------------------------
-- 10. FINE PRINT — STUCK IN NURTURE (started but not completed)
-- ----------------------------------------------------------------------------

SELECT COUNT(DISTINCT person_id) AS stuck_in_nurture
FROM public.people_events
WHERE event_type = 'fine_print_sequence_started'
  AND person_id NOT IN (
    SELECT DISTINCT person_id
    FROM public.people_events
    WHERE event_type = 'fine_print_sequence_completed'
  );


-- ----------------------------------------------------------------------------
-- 11. SEND FAILURE LOG (last 30 days)
-- ----------------------------------------------------------------------------

SELECT
  pe.event_type,
  COUNT(*) AS failures,
  MAX(pe.created_at) AS last_failure
FROM public.people_events pe
WHERE pe.event_type IN (
    'fine_print_email_send_failed',
    'fine_print_audience_add_failed',
    'product_update_send_failed'
  )
  AND pe.created_at > NOW() - INTERVAL '30 days'
GROUP BY pe.event_type
ORDER BY failures DESC;


-- ----------------------------------------------------------------------------
-- 12. PRE-SEND SANITY CHECK (run before any editorial or product update send)
-- ----------------------------------------------------------------------------

-- Confirm audience sizes, no duplicate sends, and recent failure rate
WITH audience AS (
  SELECT
    (SELECT COUNT(*) FROM public.v_fine_print_editorial_audience) AS fine_print_size,
    (SELECT COUNT(*) FROM public.v_product_updates_audience)      AS product_updates_size
),
failures AS (
  SELECT COUNT(*) AS recent_failures
  FROM public.people_events
  WHERE event_type LIKE '%_send_failed'
    AND created_at > NOW() - INTERVAL '7 days'
)
SELECT
  a.fine_print_size,
  a.product_updates_size,
  f.recent_failures,
  CASE WHEN f.recent_failures > 0 THEN '⚠️  review failures before sending' ELSE '✓ clean' END AS status
FROM audience a, failures f;

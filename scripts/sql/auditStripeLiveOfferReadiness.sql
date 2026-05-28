-- ============================================================================
-- Stripe Live Offer Readiness Audit
-- ============================================================================
--
-- Read-only checks for reviewing Fine Diet offers before promoting live Stripe
-- products, prices, buy links, and entitlement mappings.
--
-- This script does not switch traffic, update offer rows, delete sandbox/test
-- config, or mutate payment records.
-- ============================================================================

-- A) Active offer payment config health.
SELECT
  offer_key,
  name,
  billing_model,
  purchase_provider,
  provider_product_id,
  stripe_price_id,
  stripe_phase_price_ids,
  stripe_phase_iterations,
  success_path,
  cancel_path,
  CASE
    WHEN billing_model IN ('one_time', 'subscription')
      AND coalesce(stripe_price_id, '') !~ '^price_[A-Za-z0-9]+$'
      THEN 'blocking: missing or malformed stripe_price_id'
    WHEN billing_model = 'installment'
      AND (
        stripe_phase_price_ids IS NULL
        OR array_length(stripe_phase_price_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1
          FROM unnest(stripe_phase_price_ids) AS phase_price_id
          WHERE phase_price_id !~ '^price_[A-Za-z0-9]+$'
        )
      )
      THEN 'blocking: missing or malformed phase price id'
    WHEN billing_model = 'installment'
      AND (
        stripe_phase_iterations IS NULL
        OR array_length(stripe_phase_iterations, 1) IS DISTINCT FROM array_length(stripe_phase_price_ids, 1)
        OR EXISTS (
          SELECT 1
          FROM unnest(stripe_phase_iterations) AS phase_iteration
          WHERE phase_iteration IS NULL OR phase_iteration < 1
        )
      )
      THEN 'blocking: phase price ids and iterations are not aligned'
    WHEN coalesce(success_path, '') !~ '^/'
      THEN 'warning: success_path should be a relative path'
    WHEN coalesce(cancel_path, '') !~ '^/'
      THEN 'warning: cancel_path should be a relative path'
    ELSE 'ok'
  END AS readiness_status
FROM public.offers
WHERE is_active = true
ORDER BY offer_key;

-- B) Active offer entitlement mappings.
SELECT
  o.offer_key,
  o.name AS offer_name,
  oe.entitlement_key,
  oe.duration_days,
  oe.created_at,
  oe.updated_at
FROM public.offers o
JOIN public.offer_entitlements oe
  ON oe.offer_key = o.offer_key
WHERE o.is_active = true
  AND oe.is_active = true
ORDER BY o.offer_key, oe.entitlement_key;

-- C) Active offers missing required Stripe Price IDs.
SELECT
  offer_key,
  name,
  billing_model,
  stripe_price_id,
  stripe_phase_price_ids,
  stripe_phase_iterations,
  CASE
    WHEN billing_model IN ('one_time', 'subscription')
      AND coalesce(stripe_price_id, '') = ''
      THEN 'blocking: missing stripe_price_id'
    WHEN billing_model IN ('one_time', 'subscription')
      AND stripe_price_id !~ '^price_[A-Za-z0-9]+$'
      THEN 'blocking: malformed stripe_price_id'
    WHEN billing_model = 'installment'
      AND (
        stripe_phase_price_ids IS NULL
        OR array_length(stripe_phase_price_ids, 1) IS NULL
      )
      THEN 'blocking: missing stripe_phase_price_ids'
    WHEN billing_model = 'installment'
      AND EXISTS (
        SELECT 1
        FROM unnest(stripe_phase_price_ids) AS phase_price_id
        WHERE phase_price_id !~ '^price_[A-Za-z0-9]+$'
      )
      THEN 'blocking: malformed phase price id'
    ELSE 'review'
  END AS gate_status
FROM public.offers
WHERE is_active = true
  AND (
    (
      billing_model IN ('one_time', 'subscription')
      AND coalesce(stripe_price_id, '') !~ '^price_[A-Za-z0-9]+$'
    )
    OR (
      billing_model = 'installment'
      AND (
        stripe_phase_price_ids IS NULL
        OR array_length(stripe_phase_price_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1
          FROM unnest(stripe_phase_price_ids) AS phase_price_id
          WHERE phase_price_id !~ '^price_[A-Za-z0-9]+$'
        )
      )
    )
  )
ORDER BY offer_key;

-- D) Inactive offers that contain Stripe-looking or money-like config.
SELECT
  offer_key,
  name,
  billing_model,
  stripe_price_id,
  stripe_phase_price_ids,
  stripe_phase_iterations
FROM public.offers
WHERE is_active = false
  AND (
    stripe_price_id IS NOT NULL
    OR stripe_phase_price_ids IS NOT NULL
    OR stripe_phase_iterations IS NOT NULL
  )
ORDER BY offer_key;

-- E) Active offers sharing the same Stripe Price ID across primary or phase config.
WITH active_offer_prices AS (
  SELECT
    offer_key,
    stripe_price_id,
    'primary' AS price_source
  FROM public.offers
  WHERE is_active = true
    AND stripe_price_id IS NOT NULL

  UNION ALL

  SELECT
    o.offer_key,
    phase_price_id AS stripe_price_id,
    'phase' AS price_source
  FROM public.offers o
  CROSS JOIN LATERAL unnest(o.stripe_phase_price_ids) AS phase_price_id
  WHERE o.is_active = true
    AND o.stripe_phase_price_ids IS NOT NULL
)
SELECT
  stripe_price_id,
  array_agg(DISTINCT offer_key ORDER BY offer_key) AS active_offer_keys,
  string_agg(DISTINCT offer_key || ':' || price_source, ', ' ORDER BY offer_key || ':' || price_source) AS price_sources,
  count(DISTINCT offer_key) AS active_offer_count
FROM active_offer_prices
WHERE stripe_price_id IS NOT NULL
GROUP BY stripe_price_id
HAVING count(DISTINCT offer_key) > 1
ORDER BY stripe_price_id;

-- F) Offers without any active database entitlement mapping.
-- Note: code-owned supplements may still apply for specific offer keys, such as
-- journal-annual, but live candidates should normally have DB mappings too.
SELECT
  o.offer_key,
  o.name,
  o.is_active,
  o.billing_model
FROM public.offers o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.offer_entitlements oe
    WHERE oe.offer_key = o.offer_key
      AND oe.is_active = true
  )
ORDER BY o.offer_key;

-- G) Active entitlement keys that are not in the current code registry.
-- Keep this list in sync with docs/access/ENTITLEMENT-KEY-REGISTRY.md and
-- lib/access/constants.ts.
WITH registry(entitlement_key) AS (
  VALUES
    ('care:integrative'),
    ('feature:nds-breakdown'),
    ('feature:plans-advanced-subs'),
    ('feature:plans-ai-generate'),
    ('feature:plans-concierge'),
    ('feature:plans-nds-breakdown'),
    ('feature:plans-nds-optimize'),
    ('feature:plans-nds-projection'),
    ('feature:plans-recipe-video-import'),
    ('feature:plans-restaurant-analysis'),
    ('journal'),
    ('program:baseline'),
    ('program:gut-check')
)
SELECT
  oe.offer_key,
  oe.entitlement_key,
  oe.duration_days
FROM public.offer_entitlements oe
JOIN public.offers o
  ON o.offer_key = oe.offer_key
LEFT JOIN registry r
  ON r.entitlement_key = oe.entitlement_key
WHERE o.is_active = true
  AND oe.is_active = true
  AND r.entitlement_key IS NULL
ORDER BY oe.offer_key, oe.entitlement_key;

-- H) Typo-like inactive offer keys for manual review.
-- Uses pg_trgm similarity, which is currently installed in the project.
SELECT
  inactive.offer_key,
  inactive.name,
  inactive.billing_model,
  inactive.stripe_price_id,
  inactive.stripe_phase_price_ids,
  array_agg(active.offer_key ORDER BY active.offer_key) AS similar_active_offer_keys,
  max(round(similarity(inactive.offer_key, active.offer_key)::numeric, 2)) AS max_similarity_score
FROM public.offers inactive
JOIN public.offers active
  ON active.is_active = true
  AND active.offer_key <> inactive.offer_key
WHERE inactive.is_active = false
  AND (
    similarity(inactive.offer_key, active.offer_key) >= 0.7
    OR (
      inactive.offer_key ILIKE '%inegrative%'
      AND active.offer_key ILIKE '%integrative%'
    )
  )
GROUP BY
  inactive.offer_key,
  inactive.name,
  inactive.billing_model,
  inactive.stripe_price_id,
  inactive.stripe_phase_price_ids
ORDER BY inactive.offer_key;

-- I) All typo-similar offer key pairs for broader manual review.
SELECT
  a.offer_key AS offer_key,
  b.offer_key AS similar_offer_key,
  round(similarity(a.offer_key, b.offer_key)::numeric, 2) AS similarity_score
FROM public.offers a
JOIN public.offers b
  ON a.offer_key < b.offer_key
WHERE similarity(a.offer_key, b.offer_key) >= 0.7
ORDER BY a.offer_key, b.offer_key;

-- J) Stripe tracking table row counts.
SELECT 'stripe_customers' AS table_name, count(*) AS row_count FROM public.stripe_customers
UNION ALL
SELECT 'stripe_events', count(*) FROM public.stripe_events
UNION ALL
SELECT 'stripe_offer_instances', count(*) FROM public.stripe_offer_instances
UNION ALL
SELECT 'checkout_events', count(*) FROM public.checkout_events
ORDER BY table_name;

-- K) Recent checkout event counts for live checkout gate review.
SELECT
  event_type,
  offer_key,
  count(*) AS total_count,
  count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS count_24h,
  count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS count_7d,
  max(created_at) AS most_recent_at
FROM public.checkout_events
GROUP BY event_type, offer_key
ORDER BY most_recent_at DESC NULLS LAST, event_type, offer_key;

-- L) Recent checkout_completed events.
SELECT
  id,
  person_id,
  offer_key,
  stripe_checkout_session_id,
  stripe_subscription_id,
  stripe_payment_intent_id,
  created_at
FROM public.checkout_events
WHERE event_type = 'checkout_completed'
ORDER BY created_at DESC
LIMIT 20;

-- M) Recent Stripe webhook events.
SELECT
  stripe_event_id,
  type,
  created_at,
  processed_at
FROM public.stripe_events
ORDER BY processed_at DESC NULLS LAST, created_at DESC
LIMIT 20;

-- N) Recent Stripe offer instances.
SELECT
  id,
  person_id,
  offer_key,
  status,
  stripe_checkout_session_id,
  stripe_subscription_id,
  stripe_payment_intent_id,
  created_at,
  updated_at
FROM public.stripe_offer_instances
ORDER BY created_at DESC
LIMIT 20;

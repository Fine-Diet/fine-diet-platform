-- ============================================================================
-- Grocery Price Search — Stage 1
--
-- Durable metering and append-only price observations decoupled from ephemeral
-- generated_grocery_lists / grocery_items rows. Required grocery truth remains
-- on grocery_items and grocery_shopping_overrides.
--
-- Identity boundary:
--   person_id references people.id (never auth.uid()).
--   RLS resolves ownership via people.auth_user_id = auth.uid().
--
-- Do NOT apply to Production during Stage 1 checkpoint.
-- ============================================================================

-- ============================================================================
-- Table: grocery_price_search_cache
-- Shared normalized offer cache keyed by product + retailer + location inputs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_price_search_cache (
  cache_key TEXT PRIMARY KEY,

  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,
  preferred_product TEXT,
  retailer TEXT NOT NULL,
  postal_code TEXT NOT NULL,

  provider TEXT NOT NULL DEFAULT 'serpapi'
    CHECK (provider IN ('serpapi')),
  query_used TEXT NOT NULL,
  offers_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT grocery_price_search_cache_offers_is_array
    CHECK (jsonb_typeof(offers_json) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_grocery_price_search_cache_expires
  ON public.grocery_price_search_cache (expires_at);

COMMENT ON TABLE public.grocery_price_search_cache IS
  'Normalized retail price offer cache. Server-managed only.';

-- ============================================================================
-- Table: grocery_price_search_quota_claims
-- Pending quota reservations to prevent concurrent over-limit provider calls.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_price_search_quota_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  window_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'billed', 'released')),
  search_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_grocery_price_quota_claims_person_window
  ON public.grocery_price_search_quota_claims (person_id, window_key, status);

COMMENT ON TABLE public.grocery_price_search_quota_claims IS
  'Short-lived quota reservations claimed before provider calls. Server-managed only.';

-- ============================================================================
-- Table: grocery_price_search_events
-- Append-only search ledger for metering, audit, and sourced confirmations.
-- Ephemeral grocery_item/list references are nullable snapshots only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_price_search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  grocery_item_id UUID REFERENCES public.grocery_items(id) ON DELETE SET NULL,
  grocery_list_id UUID REFERENCES public.generated_grocery_lists(id) ON DELETE SET NULL,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  match_key TEXT NOT NULL,
  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,

  provider TEXT NOT NULL DEFAULT 'serpapi'
    CHECK (provider IN ('serpapi')),
  query TEXT NOT NULL,
  retailer TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  billed BOOLEAN NOT NULL DEFAULT false,
  result_count INTEGER NOT NULL DEFAULT 0
    CHECK (result_count >= 0),

  candidate_snapshot JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_price_search_events_candidate_snapshot_is_object
    CHECK (candidate_snapshot IS NULL OR jsonb_typeof(candidate_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_grocery_price_search_events_person_created
  ON public.grocery_price_search_events (person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grocery_price_search_events_person_billed
  ON public.grocery_price_search_events (person_id, billed, created_at DESC)
  WHERE billed = true;

CREATE INDEX IF NOT EXISTS idx_grocery_price_search_events_scope_match
  ON public.grocery_price_search_events (
    person_id,
    plan_id,
    date_range_start,
    date_range_end,
    match_key,
    created_at DESC
  );

COMMENT ON TABLE public.grocery_price_search_events IS
  'Append-only grocery retail search events. billed=true only for successful fresh provider searches with results.';

-- ============================================================================
-- Table: grocery_price_observations
-- Append-only confirmed manual or sourced prices. Current truth is the latest
-- row per person + plan scope + match_key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  grocery_item_id UUID REFERENCES public.grocery_items(id) ON DELETE SET NULL,
  grocery_list_id UUID REFERENCES public.generated_grocery_lists(id) ON DELETE SET NULL,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  match_key TEXT NOT NULL,
  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,

  source TEXT NOT NULL
    CHECK (source IN ('manual', 'serpapi')),
  retailer TEXT,
  postal_code TEXT,
  product_title TEXT NOT NULL,
  brand_name TEXT,
  package_size NUMERIC
    CHECK (package_size IS NULL OR package_size > 0),
  package_unit TEXT,
  unit_price NUMERIC NOT NULL
    CHECK (unit_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  package_count NUMERIC NOT NULL DEFAULT 1
    CHECK (package_count > 0),
  line_total NUMERIC NOT NULL
    CHECK (line_total >= 0),
  product_url TEXT,
  image_url TEXT,
  provider_result_id TEXT,
  search_event_id UUID REFERENCES public.grocery_price_search_events(id) ON DELETE SET NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_confidence NUMERIC
    CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  user_confirmed BOOLEAN NOT NULL DEFAULT false,
  supersedes_observation_id UUID REFERENCES public.grocery_price_observations(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_price_observations_scope_match_created
  ON public.grocery_price_observations (
    person_id,
    plan_id,
    date_range_start,
    date_range_end,
    match_key,
    created_at DESC
  );

COMMENT ON TABLE public.grocery_price_observations IS
  'Append-only grocery price observations. Latest row per scope+match_key is current truth.';

-- ============================================================================
-- Quota claim helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_grocery_price_search_quota(
  p_person_id UUID,
  p_window_key TEXT,
  p_limit INTEGER
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_usage INTEGER;
  v_claim_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_usage
  FROM (
    SELECT id
    FROM public.grocery_price_search_events
    WHERE person_id = p_person_id
      AND billed = true
      AND (
        p_window_key = 'lifetime'
        OR to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = p_window_key
      )
    UNION ALL
    SELECT id
    FROM public.grocery_price_search_quota_claims
    WHERE person_id = p_person_id
      AND window_key = p_window_key
      AND status = 'pending'
  ) usage_rows;

  IF v_usage >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.grocery_price_search_quota_claims (person_id, window_key)
  VALUES (p_person_id, p_window_key)
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.grocery_price_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_price_search_quota_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_price_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_price_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct client access to grocery_price_search_cache"
  ON public.grocery_price_search_cache;
CREATE POLICY "No direct client access to grocery_price_search_cache"
  ON public.grocery_price_search_cache
  FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct client access to grocery_price_search_quota_claims"
  ON public.grocery_price_search_quota_claims;
CREATE POLICY "No direct client access to grocery_price_search_quota_claims"
  ON public.grocery_price_search_quota_claims
  FOR ALL USING (false);

DROP POLICY IF EXISTS "Users can read own grocery_price_search_events"
  ON public.grocery_price_search_events;
DROP POLICY IF EXISTS "Users can insert own grocery_price_search_events"
  ON public.grocery_price_search_events;
DROP POLICY IF EXISTS "No direct client access to grocery_price_search_events"
  ON public.grocery_price_search_events;
CREATE POLICY "No direct client access to grocery_price_search_events"
  ON public.grocery_price_search_events
  FOR ALL USING (false);

DROP POLICY IF EXISTS "Users can read own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can insert own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can update own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can delete own grocery_price_observations"
  ON public.grocery_price_observations;

CREATE POLICY "Users can read own grocery_price_observations"
  ON public.grocery_price_observations
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_price_observations"
  ON public.grocery_price_observations
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_price_observations"
  ON public.grocery_price_observations
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  ) WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_price_observations"
  ON public.grocery_price_observations
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

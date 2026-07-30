-- ============================================================================
-- PR3.1a — Grocery List Price Observations (list-scoped estimates)
--
-- Append-only list-scoped price quotes for durable Full Haul lists.
-- Current truth = latest row per (person_id, grocery_list_id, grocery_item_id, match_key).
-- Does NOT overload Stage-1 grocery_price_observations (plan+date scoped).
--
-- Review-first: apply only with founder approval for the target environment.
-- Do not apply to production without explicit founder approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_list_price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  grocery_list_id UUID NOT NULL
    REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  grocery_item_id UUID NOT NULL
    REFERENCES public.grocery_items(id) ON DELETE CASCADE,

  -- Active purchasing-choice / item identity at write time
  match_key TEXT NOT NULL,
  purchasing_choice_id UUID
    REFERENCES public.grocery_list_purchasing_choices(id) ON DELETE SET NULL,
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
  search_event_id UUID,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_confidence NUMERIC
    CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  user_confirmed BOOLEAN NOT NULL DEFAULT true,
  supersedes_observation_id UUID
    REFERENCES public.grocery_list_price_observations(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_list_price_obs_lookup
  ON public.grocery_list_price_observations (
    person_id,
    grocery_list_id,
    grocery_item_id,
    match_key,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_grocery_list_price_obs_list
  ON public.grocery_list_price_observations (grocery_list_id, created_at DESC);

COMMENT ON TABLE public.grocery_list_price_observations IS
  'Append-only list-scoped price quotes for durable grocery lists. Latest per (person, list, item, match_key) is current. Separate from plan+date grocery_price_observations.';

COMMENT ON COLUMN public.grocery_list_price_observations.match_key IS
  'Must match the active list purchasing-choice match_key (or item identity) for Full Haul to prefer this quote.';

-- ============================================================================
-- RLS — owner-only via person_id
-- ============================================================================

ALTER TABLE public.grocery_list_price_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_list_price_observations"
  ON public.grocery_list_price_observations;
DROP POLICY IF EXISTS "Users can insert own grocery_list_price_observations"
  ON public.grocery_list_price_observations;
DROP POLICY IF EXISTS "Users can update own grocery_list_price_observations"
  ON public.grocery_list_price_observations;
DROP POLICY IF EXISTS "Users can delete own grocery_list_price_observations"
  ON public.grocery_list_price_observations;

CREATE POLICY "Users can read own grocery_list_price_observations"
  ON public.grocery_list_price_observations
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_list_price_observations"
  ON public.grocery_list_price_observations
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_list_price_observations"
  ON public.grocery_list_price_observations
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_list_price_observations"
  ON public.grocery_list_price_observations
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

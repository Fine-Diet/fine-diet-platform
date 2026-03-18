-- ============================================================================
-- food_search_events — Phase 2 Search Analytics
-- Run in Supabase Dashboard → SQL Editor
--
-- Captures search behavior for future search quality improvement.
-- Does NOT affect any existing search tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.food_search_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT        NOT NULL
                           CHECK (event_type IN (
                             'search_executed',
                             'search_zero_results',
                             'search_result_selected',
                             'search_abandoned'
                           )),
  session_id   TEXT,
  person_id    UUID        REFERENCES public.people(id) ON DELETE SET NULL,
  query        TEXT,
  -- Counts by source layer
  total_result_count    INTEGER,
  curated_result_count  INTEGER,
  off_result_count      INTEGER,
  -- Selection info (populated for search_result_selected)
  selected_food_id       TEXT,
  selected_food_source   TEXT  CHECK (selected_food_source IN ('user', 'curated', 'off') OR selected_food_source IS NULL),
  selected_result_position INTEGER,
  page_context TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_search_events_created
  ON public.food_search_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_search_events_person
  ON public.food_search_events(person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_food_search_events_type
  ON public.food_search_events(event_type);

COMMENT ON TABLE public.food_search_events IS
  'Search behavior log for quality improvement. Phase 2. Does not affect food data.';

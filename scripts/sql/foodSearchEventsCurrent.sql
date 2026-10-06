-- ============================================================================
-- food_search_events — current source of truth
--
-- Idempotent. Safe to re-run. Does NOT get applied by the Food Search
-- Reliability v1 code change. Production does not contain this table today.
-- Apply this file, not the historical fragments, when the production
-- migration is explicitly approved.
--
-- Historical fragments this file reconciles:
--   scripts/sql/createFoodSearchEvents.sql
--     Phase 2 base table. No telemetry columns, no RLS.
--   scripts/sql/alterFoodSearchEventsPhase3.sql
--     Added telemetry, but named the near-exact column
--     near_exact_curated_match and marked off_fallback_shown NOT NULL.
--   scripts/sql/phase3OffMirror.sql
--     Added the same telemetry under the name the application writes:
--     near_exact_match_existed. Booleans were nullable.
--
-- The writer is lib/food/foodSearchEventSchema.ts, used by
-- logSearchEvent in lib/food/foodServerService.ts and
-- POST /api/foods/search-event. It inserts NULL for omitted booleans,
-- so those columns are nullable. The canonical near-exact column name
-- is near_exact_match_existed.
--
-- Legacy column order:
--   1. If near_exact_curated_match exists and near_exact_match_existed
--      does not, rename the old column to the new name first. Adding
--      the new column before that rename makes the rename condition
--      unreachable and leaves the legacy values behind.
--   2. Add near_exact_match_existed only if it is still absent.
--   3. If both columns exist, copy legacy values into the canonical
--      column only where the canonical value is NULL. Do not overwrite
--      a non-null canonical value. Keep the legacy column so a
--      conflicting pair is not discarded.
--
-- Access: service_role only. RLS is enabled with no anon/authenticated
-- policy (default deny). supabaseAdmin uses the service role, which
-- bypasses RLS. This matches missing_item_requests.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.food_search_events (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type                 TEXT        NOT NULL
                                         CHECK (event_type IN (
                                           'search_executed',
                                           'search_zero_results',
                                           'search_result_selected',
                                           'search_abandoned'
                                         )),
  session_id                 TEXT,
  person_id                  UUID        REFERENCES public.people(id) ON DELETE SET NULL,
  query                      TEXT,
  normalized_query           TEXT,
  total_result_count         INTEGER,
  curated_result_count       INTEGER,
  off_result_count           INTEGER,
  off_fallback_shown         BOOLEAN,
  near_exact_match_existed   BOOLEAN,
  selected_food_id           TEXT,
  selected_food_source       TEXT
                                         CHECK (
                                           selected_food_source IN ('user', 'curated', 'off')
                                           OR selected_food_source IS NULL
                                         ),
  selected_result_position   INTEGER,
  page_context               TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.food_search_events
  ADD COLUMN IF NOT EXISTS normalized_query TEXT,
  ADD COLUMN IF NOT EXISTS off_fallback_shown BOOLEAN,
  ADD COLUMN IF NOT EXISTS total_result_count INTEGER,
  ADD COLUMN IF NOT EXISTS curated_result_count INTEGER,
  ADD COLUMN IF NOT EXISTS off_result_count INTEGER,
  ADD COLUMN IF NOT EXISTS selected_food_id TEXT,
  ADD COLUMN IF NOT EXISTS selected_food_source TEXT,
  ADD COLUMN IF NOT EXISTS selected_result_position INTEGER,
  ADD COLUMN IF NOT EXISTS page_context TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS query TEXT;

-- Rename the superseded column before the canonical column is added.
-- Once near_exact_match_existed exists, "old AND NOT new" can never fire.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'food_search_events'
      AND column_name = 'near_exact_curated_match'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'food_search_events'
      AND column_name = 'near_exact_match_existed'
  ) THEN
    ALTER TABLE public.food_search_events
      RENAME COLUMN near_exact_curated_match TO near_exact_match_existed;
  END IF;
END $$;

ALTER TABLE public.food_search_events
  ADD COLUMN IF NOT EXISTS near_exact_match_existed BOOLEAN;

-- Both names present: fill only empty canonical values from the legacy
-- column. Leave a non-null canonical value alone, and keep the legacy
-- column so conflicting data is still stored.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'food_search_events'
      AND column_name = 'near_exact_curated_match'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'food_search_events'
      AND column_name = 'near_exact_match_existed'
  ) THEN
    UPDATE public.food_search_events
    SET near_exact_match_existed = near_exact_curated_match
    WHERE near_exact_match_existed IS NULL
      AND near_exact_curated_match IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.food_search_events
  ALTER COLUMN off_fallback_shown DROP NOT NULL,
  ALTER COLUMN near_exact_match_existed DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_food_search_events_created
  ON public.food_search_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_search_events_person
  ON public.food_search_events (person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_food_search_events_type
  ON public.food_search_events (event_type);

ALTER TABLE public.food_search_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.food_search_events FROM PUBLIC;
REVOKE ALL ON public.food_search_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_search_events TO service_role;

COMMENT ON TABLE public.food_search_events IS
  'Search behavior log. Service-role writes only. Does not affect food data.';

COMMENT ON COLUMN public.food_search_events.near_exact_match_existed IS
  'True when curated results contained a near-exact match. Application column. '
  'Renamed from near_exact_curated_match when that was the only name. '
  'If both columns exist, null canonical values are backfilled from the legacy column.';

COMMENT ON COLUMN public.food_search_events.off_fallback_shown IS
  'True when a promoted-OFF or raw-OFF section was shown. Nullable because '
  'client selection/abandon events do not populate it.';

-- ============================================================================
-- Phase 3: Extend food_search_events with richer telemetry columns
--
-- Historical. Superseded by scripts/sql/foodSearchEventsCurrent.sql.
-- The application writes near_exact_match_existed, not
-- near_exact_curated_match, and it writes NULL when a client
-- selection/abandon event omits the booleans. Columns stay nullable.
-- ============================================================================

ALTER TABLE public.food_search_events
  ADD COLUMN IF NOT EXISTS normalized_query          TEXT,
  ADD COLUMN IF NOT EXISTS off_fallback_shown        BOOLEAN,
  ADD COLUMN IF NOT EXISTS near_exact_match_existed  BOOLEAN;

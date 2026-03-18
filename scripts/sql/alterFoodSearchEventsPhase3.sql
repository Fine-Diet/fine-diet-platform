-- ============================================================================
-- Phase 3: Extend food_search_events with richer telemetry columns
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE public.food_search_events
  ADD COLUMN IF NOT EXISTS normalized_query          TEXT,
  ADD COLUMN IF NOT EXISTS off_fallback_shown        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS near_exact_curated_match  BOOLEAN NOT NULL DEFAULT false;

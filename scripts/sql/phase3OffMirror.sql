-- ============================================================================
-- Phase 3 OFF Mirror — Migrations
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Extend food_search_events with Phase 3 telemetry columns
ALTER TABLE public.food_search_events
  ADD COLUMN IF NOT EXISTS normalized_query          TEXT,
  ADD COLUMN IF NOT EXISTS off_fallback_shown        BOOLEAN,
  ADD COLUMN IF NOT EXISTS near_exact_match_existed  BOOLEAN;

-- 2. Promotion candidate workflow
-- Tracks OFF items that have been selected enough times to warrant admin review.
-- Separate from curated/core foods. Admin/reviewer owns promotion to core catalog.
CREATE TABLE IF NOT EXISTS public.off_promotion_candidates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  off_product_id        TEXT        NOT NULL UNIQUE,
  -- Status: raw_off → review_needed → promoted | rejected
  status                TEXT        NOT NULL DEFAULT 'raw_off'
                                    CHECK (status IN (
                                      'raw_off', 'normalized_off',
                                      'review_needed', 'promoted', 'rejected'
                                    )),
  -- Selection demand counters
  selection_count       INTEGER     NOT NULL DEFAULT 0,
  -- Array of distinct session_ids that selected this item (JSONB for portability)
  session_ids           JSONB       NOT NULL DEFAULT '[]',
  distinct_session_count INTEGER    NOT NULL DEFAULT 0,
  -- Optional manual flag from admin
  admin_flagged         BOOLEAN     NOT NULL DEFAULT false,
  notes                 TEXT,
  -- Timestamps
  first_selected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_selected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_off_promotion_candidates_status
  ON public.off_promotion_candidates(status);

CREATE INDEX IF NOT EXISTS idx_off_promotion_candidates_selection_count
  ON public.off_promotion_candidates(selection_count DESC);

COMMENT ON TABLE public.off_promotion_candidates IS
  'OFF items with repeated demand that may warrant promotion to core catalog. '
  'Admin/reviewer must approve any promotion — no automatic writes to food_objects.';

COMMENT ON COLUMN public.off_promotion_candidates.session_ids IS
  'JSON array of distinct session IDs that selected this OFF item. '
  'Used to compute distinct_session_count. Capped at 50 entries for storage efficiency.';

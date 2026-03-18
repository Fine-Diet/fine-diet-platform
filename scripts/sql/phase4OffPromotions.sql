-- ============================================================================
-- Phase 4 OFF Promotions — Migrations
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Extend off_promotion_candidates with product snapshot + review metadata
--    product_name / brands: denormalized for fast list rendering in the admin queue
--    review fields: current-state for easy list/filter without joining audit log
ALTER TABLE public.off_promotion_candidates
  ADD COLUMN IF NOT EXISTS product_name          TEXT,
  ADD COLUMN IF NOT EXISTS brands                TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id   TEXT,   -- Supabase auth user ID
  ADD COLUMN IF NOT EXISTS reviewed_by_email     TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_role         TEXT,
  ADD COLUMN IF NOT EXISTS review_notes          TEXT,
  ADD COLUMN IF NOT EXISTS flag_normalization    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deferred              BOOLEAN NOT NULL DEFAULT false;

-- Backfill product_name and brands from OFF mirror for existing candidates
UPDATE public.off_promotion_candidates c
SET
  product_name = m.product_name,
  brands       = m.brands
FROM public.off_products_mirror m
WHERE m.off_product_id = c.off_product_id
  AND c.product_name IS NULL;

-- ============================================================================
-- 2. Append-only promotion audit log
--    One row per action. Never updated or deleted.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.off_promotion_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID        NOT NULL REFERENCES public.off_promotion_candidates(id),
  action          TEXT        NOT NULL
                              CHECK (action IN (
                                'mark_reviewed', 'defer', 'flag_normalization',
                                'add_notes', 'reject', 'promote'
                              )),
  from_status     TEXT        NOT NULL,
  to_status       TEXT        NOT NULL,
  actor_user_id   TEXT,                  -- Supabase auth user ID (TEXT to avoid auth.users FK)
  actor_email     TEXT,
  actor_role      TEXT        NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_off_promotion_audit_candidate
  ON public.off_promotion_audit(candidate_id, created_at DESC);

COMMENT ON TABLE public.off_promotion_audit IS
  'Append-only log of every OFF promotion decision. Never mutated after insert.';

-- ============================================================================
-- 3. Intermediate promoted foods table
--    Stores a snapshot of the promoted item at promotion time.
--    Does NOT auto-write into food_objects.
--    Admin must manually transfer to curated/core catalog.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.promoted_off_foods (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID        NOT NULL REFERENCES public.off_promotion_candidates(id),
  off_product_id        TEXT        NOT NULL,
  -- Snapshot at promotion time
  product_name          TEXT        NOT NULL,
  brands                TEXT,
  barcode               TEXT,
  -- Serving normalization snapshot
  serving_size_text     TEXT,
  serving_size_g        NUMERIC,
  -- Nutrition per 100g snapshot (from OFF mirror at promotion time)
  calories_per_100g     NUMERIC,
  protein_g_100g        NUMERIC,
  carbs_g_100g          NUMERIC,
  fat_g_100g            NUMERIC,
  fiber_g_100g          NUMERIC,
  sugars_g_100g         NUMERIC,
  sodium_mg_100g        NUMERIC,
  -- Data quality at promotion time
  completeness_score    INTEGER,
  -- Promotion metadata
  promoted_by_user_id   TEXT,
  promoted_by_email     TEXT,
  promoted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                 TEXT,
  -- Lifecycle status for the promoted snapshot itself
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'superseded', 'archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_off_product
  ON public.promoted_off_foods(off_product_id);

CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_status
  ON public.promoted_off_foods(status);

COMMENT ON TABLE public.promoted_off_foods IS
  'OFF items explicitly promoted by an admin after review. '
  'Stores a trusted snapshot. Does NOT auto-write into food_objects. '
  'Manual transfer to curated catalog is a separate admin step.';

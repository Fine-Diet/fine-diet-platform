-- ============================================================================
-- FOODDATA Search Cleanup — Phase B: DB / Index Cleanup
-- Goal: remove the index/schema gaps surfaced by Phase A instrumentation.
--
-- Findings driving this migration (captured against the live project on
-- 2026-04-24, env NEXT_PUBLIC_SUPABASE_URL = tssvlflebugqhtogqdfs):
--   1. food_objects.upc index already exists (idx_food_objects_upc and
--      idx_food_objects_upc_unique). The "missing UPC index" called out in
--      the original FOODDATA review was based on a stale comment in
--      fineDietInternalFoods.sql; the live DB is fine.
--   2. promoted_off_foods + off_promotion_candidates tables DO NOT exist
--      in the live DB. phase3OffMirror.sql and phase4OffPromotions.sql were
--      authored but never applied to this project. This is the actual root
--      cause of the schema-cache errors observed by the Phase A retrieval
--      instrumentation on the searchPromotedOffFoods stage.
--   3. off_products_mirror is hot. Its 1.59M-row ILIKE searches were doing
--      Seq Scans (e.g. "tim tam" → 9,284ms; "amylu chicken" → 1,109ms).
--      The existing to_tsvector GIN index does NOT accelerate ILIKE %term%.
--      We need pg_trgm GIN indexes on product_name / brands / generic_name.
--   4. pg_trgm extension is installed (public schema, v1.6).
--
-- This file is the human-readable record of the Phase B DDL. The actual
-- application happens in two pieces:
--   • Transactional DDL (CREATE TABLE, small CREATE INDEX) — applied via
--     Supabase migrations as `phase_b_promoted_off_tables_and_trgm`.
--   • CONCURRENT DDL on the 1.59M-row mirror — applied via raw execute_sql
--     because CREATE INDEX CONCURRENTLY cannot run inside a transaction.
--
-- After all DDL: NOTIFY pgrst, 'reload schema' to refresh the PostgREST
-- schema cache so the newly-created promoted_off_foods table is reachable
-- from the search path.
-- ============================================================================

-- ============================================================================
-- Part 1: Backfill phase 3 + phase 4 schema (off_promotion_candidates,
--          promoted_off_foods, off_promotion_audit, candidate snapshot cols).
--          Re-applied here so the live DB matches the code's expectations.
--          Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is idempotent.
-- ============================================================================

-- Enable pg_trgm if not already (no-op when already installed)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1a. off_promotion_candidates (phase3OffMirror.sql)
CREATE TABLE IF NOT EXISTS public.off_promotion_candidates (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  off_product_id         TEXT        NOT NULL UNIQUE,
  status                 TEXT        NOT NULL DEFAULT 'raw_off'
                                     CHECK (status IN (
                                       'raw_off', 'normalized_off',
                                       'review_needed', 'promoted', 'rejected'
                                     )),
  selection_count        INTEGER     NOT NULL DEFAULT 0,
  session_ids            JSONB       NOT NULL DEFAULT '[]',
  distinct_session_count INTEGER     NOT NULL DEFAULT 0,
  admin_flagged          BOOLEAN     NOT NULL DEFAULT false,
  notes                  TEXT,
  first_selected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_selected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_off_promotion_candidates_status
  ON public.off_promotion_candidates(status);

CREATE INDEX IF NOT EXISTS idx_off_promotion_candidates_selection_count
  ON public.off_promotion_candidates(selection_count DESC);

-- 1b. phase4 candidate snapshot/review columns (additive, idempotent)
ALTER TABLE public.off_promotion_candidates
  ADD COLUMN IF NOT EXISTS product_name        TEXT,
  ADD COLUMN IF NOT EXISTS brands              TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_email   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_role       TEXT,
  ADD COLUMN IF NOT EXISTS review_notes        TEXT,
  ADD COLUMN IF NOT EXISTS flag_normalization  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deferred            BOOLEAN NOT NULL DEFAULT false;

-- 1c. off_promotion_audit (phase4OffPromotions.sql)
CREATE TABLE IF NOT EXISTS public.off_promotion_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID        NOT NULL REFERENCES public.off_promotion_candidates(id),
  action        TEXT        NOT NULL
                            CHECK (action IN (
                              'mark_reviewed', 'defer', 'flag_normalization',
                              'add_notes', 'reject', 'promote'
                            )),
  from_status   TEXT        NOT NULL,
  to_status     TEXT        NOT NULL,
  actor_user_id TEXT,
  actor_email   TEXT,
  actor_role    TEXT        NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_off_promotion_audit_candidate
  ON public.off_promotion_audit(candidate_id, created_at DESC);

-- 1d. promoted_off_foods (phase4OffPromotions.sql)
CREATE TABLE IF NOT EXISTS public.promoted_off_foods (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        UUID        NOT NULL REFERENCES public.off_promotion_candidates(id),
  off_product_id      TEXT        NOT NULL,
  product_name        TEXT        NOT NULL,
  brands              TEXT,
  barcode             TEXT,
  serving_size_text   TEXT,
  serving_size_g      NUMERIC,
  calories_per_100g   NUMERIC,
  protein_g_100g      NUMERIC,
  carbs_g_100g        NUMERIC,
  fat_g_100g          NUMERIC,
  fiber_g_100g        NUMERIC,
  sugars_g_100g       NUMERIC,
  sodium_mg_100g      NUMERIC,
  completeness_score  INTEGER,
  promoted_by_user_id TEXT,
  promoted_by_email   TEXT,
  promoted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT,
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'superseded', 'archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing indexes from phase4OffPromotions.sql
CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_off_product
  ON public.promoted_off_foods(off_product_id);

CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_status
  ON public.promoted_off_foods(status);

-- ============================================================================
-- Part 2: Phase B new indexes on promoted_off_foods
-- Justification: searchPromotedOffFoods (foodServerService.ts) issues
--   .eq('status','active').or(<ILIKE on product_name + brands [+ barcode/off_product_id]>)
-- Currently empty, but we want indexes ready before any data lands so the
-- query planner uses them immediately.
-- ============================================================================

-- 2a. Trigram GIN on product_name (ILIKE %term%)
CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_product_name_trgm
  ON public.promoted_off_foods USING gin (product_name gin_trgm_ops);

-- 2b. Trigram GIN on brands (ILIKE %term%, partial because brands is nullable)
CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_brands_trgm
  ON public.promoted_off_foods USING gin (brands gin_trgm_ops)
  WHERE brands IS NOT NULL;

-- 2c. B-tree on barcode for the .or(...barcode.eq.X) fallback path
CREATE INDEX IF NOT EXISTS idx_promoted_off_foods_barcode
  ON public.promoted_off_foods(barcode)
  WHERE barcode IS NOT NULL;

-- ============================================================================
-- Part 3: Phase B trigram GIN indexes on off_products_mirror
-- These MUST be applied with CREATE INDEX CONCURRENTLY because the table
-- has ~1.59M rows and is constantly written by ingestion. CONCURRENT
-- builds cannot run inside a transaction, so they are NOT included in the
-- main migration above — they are applied via raw execute_sql.
--
-- For reference, the exact statements are:
-- ----------------------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_off_products_mirror_product_name_trgm
--   ON public.off_products_mirror USING gin (product_name gin_trgm_ops)
--   WHERE product_name IS NOT NULL;
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_off_products_mirror_brands_trgm
--   ON public.off_products_mirror USING gin (brands gin_trgm_ops)
--   WHERE brands IS NOT NULL;
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_off_products_mirror_generic_name_trgm
--   ON public.off_products_mirror USING gin (generic_name gin_trgm_ops)
--   WHERE generic_name IS NOT NULL;
-- ----------------------------------------------------------------------------
--
-- Justification:
--   Search code does ILIKE %token% across product_name / generic_name /
--   brands. The existing to_tsvector GIN on product_name does not accelerate
--   ILIKE; only pg_trgm GIN indexes can. Baseline EXPLAIN ANALYZE before
--   indexes:
--     "tim tam"            → Seq Scan,  9284 ms (rows removed: 1,594,370)
--     "amylu" + "chicken"  → Parallel Seq Scan, 1109 ms
--   These are exactly the slow stages the Phase A logs flagged.
--
-- ============================================================================

-- ============================================================================
-- Part 4: PostgREST schema reload
-- Required after CREATE TABLE so PostgREST can see promoted_off_foods.
-- ----------------------------------------------------------------------------
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- ============================================================================
-- Part 4b: Phase B-extension — food_objects.aliases GIN index
-- ----------------------------------------------------------------------------
-- Discovered while measuring post-Phase-B steady state: phaseA_food_objects
-- became the dominant search bottleneck (~2.3 s warm-cache Parallel Seq Scan
-- over ~561K rows). The query mixes
--    canonical_name ILIKE %x%
--    brand_name     ILIKE %x%
--    aliases @> ARRAY[x]
-- inside a single OR per token group. With trgm GIN on the two text columns
-- but NO index on aliases, the planner refuses to build a bitmap-OR plan and
-- falls through to a parallel seq scan. Adding a GIN index on aliases gives
-- the planner the third leg it needs.
--
-- Applied via raw execute_sql (CONCURRENT cannot run inside a transaction).
-- table is hot (live OFF ingestion in progress), so CONCURRENT is required.
-- aliases is text[], default '{}', NOT NULL in practice; default array_ops
-- op class supports @>, <@, =, &&. No partial predicate (we'd skip only 33
-- of 560,981 rows and the search code never sends a matching predicate).
-- ----------------------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_food_objects_aliases_gin
--   ON public.food_objects USING gin (aliases);
-- ANALYZE public.food_objects;
-- ============================================================================

-- ============================================================================
-- Part 5: off_product_search_aliases — DECISION
-- ----------------------------------------------------------------------------
-- This table is populated by scripts/importOpenFoodFactsPhase1.ts on every
-- ingestion run (~4.35M rows currently). It is NOT read anywhere in the
-- search path (lib/food/foodServerService.ts has no reference to it).
--
-- Decision for Phase B: KEEP, do not query, do not drop.
--   • Keeping the data preserves an option for a future alias-based
--     retrieval stage (Phase C/D) without re-paying the ingestion cost.
--   • Dropping is risky without first verifying nothing else depends on
--     it; the existing GIN(to_tsvector(value)) index is also reusable for
--     a future ranked alias search.
--   • Continuing to populate it during ingestion is cheap relative to OFF
--     batch sizes and avoids regenerating it later.
--
-- Phase D / E will revisit whether this becomes the canonical alias
-- index (replacing some of the off_products_mirror ILIKE queries) or
-- whether we drop it.
-- ============================================================================

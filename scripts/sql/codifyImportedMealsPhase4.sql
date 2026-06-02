-- ============================================================================
-- Meal Object Foundation — Packet 2: Codify imported_meals Phase-4 columns
--
-- WHY THIS EXISTS
--   The Phase-4 import/review pipeline (lib/plans/importsServerService.ts)
--   reads and writes seven columns on public.imported_meals that were never
--   captured in a checked-in migration. They exist only in the deployed DB
--   (see docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md §1.5). This script
--   codifies the CURRENT LIVE schema so the repo's SQL is the source of truth
--   before any further changes are layered on.
--
-- COLUMNS CODIFIED (verified against the live database):
--   import_type            TEXT  NULL   CHECK in ('pasted_text','url','video')
--   source_platform        TEXT  NULL
--   raw_input_text         TEXT  NULL
--   parse_status           TEXT  NOT NULL DEFAULT 'pending'
--                                CHECK in ('pending','parsed','failed','manual_review')
--   parsed_payload_json    JSONB NULL    -- reviewable draft (ImportedMealDraftPayload)
--   nutrition_estimate_json JSONB NULL   -- NutritionEstimate
--   ingredient_match_json  JSONB NULL    -- IngredientMatchEntry[]
--
-- SAFETY
--   - Strictly additive. No column is dropped, renamed, or retyped.
--   - `ADD COLUMN IF NOT EXISTS` is a no-op on the live DB (columns already
--     present) and creates them on a fresh DB. CHECK constraints are added
--     separately, under catalog guards, using the exact live constraint names
--     so fresh and existing databases converge to an identical shape with no
--     duplicate auto-named constraints.
--   - Does NOT change import runtime behavior. No data is migrated.
--
-- Run in Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Columns (additive; type + default only — CHECKs added under guards below).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS import_type TEXT;

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS source_platform TEXT;

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS raw_input_text TEXT;

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS parse_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS parsed_payload_json JSONB;

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS nutrition_estimate_json JSONB;

ALTER TABLE IF EXISTS public.imported_meals
  ADD COLUMN IF NOT EXISTS ingredient_match_json JSONB;

-- ----------------------------------------------------------------------------
-- CHECK constraints (idempotent, exact live names).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imported_meals_import_type_check'
      AND conrelid = 'public.imported_meals'::regclass
  ) THEN
    ALTER TABLE public.imported_meals
      ADD CONSTRAINT imported_meals_import_type_check
      CHECK (import_type IS NULL OR import_type IN ('pasted_text', 'url', 'video'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imported_meals_parse_status_check'
      AND conrelid = 'public.imported_meals'::regclass
  ) THEN
    ALTER TABLE public.imported_meals
      ADD CONSTRAINT imported_meals_parse_status_check
      CHECK (parse_status IN ('pending', 'parsed', 'failed', 'manual_review'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Index (live read path for the review UI; mirrors imported_menus pattern).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_imported_meals_person_parse_status
  ON public.imported_meals (person_id, parse_status, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Comments (document the contract).
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.imported_meals.import_type IS
  'Phase 4: user-facing input modality (pasted_text|url|video). NULL for pre-Phase-4 rows. Distinct from source_type (the NDS-ingest canonical).';
COMMENT ON COLUMN public.imported_meals.source_platform IS
  'Phase 4: optional originating platform label (e.g. instagram, tiktok, a domain). NULL when unknown.';
COMMENT ON COLUMN public.imported_meals.raw_input_text IS
  'Phase 4: verbatim raw input text preserved for re-parse, manual_review, and audit.';
COMMENT ON COLUMN public.imported_meals.parse_status IS
  'Phase 4: parse lifecycle (pending|parsed|failed|manual_review). manual_review = captured but not auto-structured.';
COMMENT ON COLUMN public.imported_meals.parsed_payload_json IS
  'Phase 4: reviewable draft (ImportedMealDraftPayload) — ingredients + steps + meal_type_hint. Distinct from the attachable imported_meals.payload (PlannedMealPayload).';
COMMENT ON COLUMN public.imported_meals.nutrition_estimate_json IS
  'Phase 4: NutritionEstimate for the draft (per-serving estimate + confidence). NULL until estimated.';
COMMENT ON COLUMN public.imported_meals.ingredient_match_json IS
  'Phase 4: IngredientMatchEntry[] — per-ingredient grounding to food_objects with match_status/source_kind. NULL until matched.';

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='imported_meals'
--      AND column_name IN ('import_type','source_platform','raw_input_text',
--                          'parse_status','parsed_payload_json',
--                          'nutrition_estimate_json','ingredient_match_json')
--    ORDER BY column_name;
-- ----------------------------------------------------------------------------

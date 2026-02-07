-- ============================================================================
-- Nutrition Density Score Fields: Schema Update for Fine Diet Internal Foods
-- 
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- This migration adds new nutrient columns required for the Nutrition Density Score:
-- - Minerals: potassium, magnesium, iron, calcium, zinc
-- - Vitamins: folate, vitamin_a_ug_rae, vitamin_c, vitamin_d, vitamin_b12
-- - Renames/confirms: calories_kcal alias, sodium_mg (penalty)
-- 
-- IMPORTANT: 
-- - Vitamin A is stored as RAE (Retinol Activity Equivalents) in micrograms
-- - All new fields allow NULL (do NOT coerce blank to 0)
-- - USDA fields remain untouched
-- ============================================================================

-- ============================================================================
-- Part 1: Add Mineral Columns
-- ============================================================================

-- Potassium (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS potassium_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.potassium_mg IS 
  'Potassium in milligrams per serving. Used in Nutrition Density Score.';

-- Magnesium (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS magnesium_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.magnesium_mg IS 
  'Magnesium in milligrams per serving. Used in Nutrition Density Score.';

-- Iron (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS iron_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.iron_mg IS 
  'Iron in milligrams per serving. Used in Nutrition Density Score.';

-- Calcium (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS calcium_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.calcium_mg IS 
  'Calcium in milligrams per serving. Used in Nutrition Density Score.';

-- Zinc (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS zinc_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.zinc_mg IS 
  'Zinc in milligrams per serving. Used in Nutrition Density Score.';

-- ============================================================================
-- Part 2: Add Vitamin Columns
-- ============================================================================

-- Folate (μg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS folate_ug NUMERIC;

COMMENT ON COLUMN public.food_objects.folate_ug IS 
  'Folate in micrograms (μg) per serving. Used in Nutrition Density Score.';

-- Vitamin A RAE (μg) - IMPORTANT: Must be RAE (Retinol Activity Equivalents)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS vitamin_a_ug_rae NUMERIC;

COMMENT ON COLUMN public.food_objects.vitamin_a_ug_rae IS 
  'Vitamin A in micrograms RAE (Retinol Activity Equivalents) per serving. Required for Nutrition Density Score. Use RAE, not IU.';

-- Vitamin C (mg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS vitamin_c_mg NUMERIC;

COMMENT ON COLUMN public.food_objects.vitamin_c_mg IS 
  'Vitamin C in milligrams per serving. Used in Nutrition Density Score.';

-- Vitamin D (μg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS vitamin_d_ug NUMERIC;

COMMENT ON COLUMN public.food_objects.vitamin_d_ug IS 
  'Vitamin D in micrograms (μg) per serving. Used in Nutrition Density Score.';

-- Vitamin B12 (μg)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS vitamin_b12_ug NUMERIC;

COMMENT ON COLUMN public.food_objects.vitamin_b12_ug IS 
  'Vitamin B12 in micrograms (μg) per serving. Used in Nutrition Density Score.';

-- ============================================================================
-- Part 3: Ensure serving fields have appropriate defaults
-- ============================================================================

-- Note: serving_size_g and serving_unit already exist, but let's ensure defaults
-- serving_size_g default to 100 for Fine Diet foods (applied in API code)
-- serving_unit default to 'g' for Fine Diet foods (applied in API code)

-- Ensure serving_description column exists (for household descriptions)
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS serving_description TEXT;

-- Ensure household_serving_text column exists
ALTER TABLE public.food_objects
ADD COLUMN IF NOT EXISTS household_serving_text TEXT;

-- ============================================================================
-- Part 4: Add index for score readiness queries (optional optimization)
-- ============================================================================

-- Index for quickly finding foods with complete micronutrient data
-- This helps admin dashboards filter by "score ready" status
CREATE INDEX IF NOT EXISTS idx_food_objects_micronutrient_completeness 
  ON public.food_objects(
    source_provider, 
    is_deleted
  ) 
  WHERE source_provider = 'fine_diet' AND is_deleted = false;

-- ============================================================================
-- Part 5: Verification queries (run after migration to verify)
-- ============================================================================

-- Check new columns exist:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'food_objects' 
--   AND column_name IN (
--     'potassium_mg', 'magnesium_mg', 'iron_mg', 'calcium_mg', 'zinc_mg',
--     'folate_ug', 'vitamin_a_ug_rae', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug'
--   )
-- ORDER BY column_name;

-- Check a sample food to confirm structure:
-- SELECT 
--   canonical_name,
--   calories, protein_g, fiber_g,
--   potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg,
--   folate_ug, vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug,
--   sodium_mg
-- FROM food_objects 
-- WHERE source_provider = 'fine_diet' 
-- LIMIT 5;

-- ============================================================================
-- Notes on existing fields (no changes needed):
-- ============================================================================
-- calories - already exists (will be aliased as calories_kcal in types)
-- protein_g - already exists (required)
-- fiber_g - already exists (required)
-- carbs_g - already exists (recommended)
-- fat_g - already exists (recommended)
-- sodium_mg - already exists (penalty nutrient)
-- sugar_g - already exists (kept for compatibility)
-- serving_size_g - already exists
-- serving_unit - already exists

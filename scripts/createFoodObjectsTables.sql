-- ============================================================================
-- Food Objects Tables — Phase 3 Foundation
-- Run this in Supabase Dashboard → SQL Editor
--
-- Principles:
-- - All items resolve to ONE canonical FoodObject model
-- - Source tiering affects ranking/confidence, not logging ability
-- - Normalization: proper casing, canonicalName + aliases, grams-based serving
-- - Nutrients store provenance + confidence (high/medium/low)
-- ============================================================================

-- ============================================================================
-- food_objects
-- Canonical food items (branded, common, user-created)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.food_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  canonical_name TEXT NOT NULL,              -- Normalized display name (Title Case)
  brand_name TEXT,                           -- Brand if applicable (null for generic)
  aliases TEXT[] DEFAULT '{}',               -- Alternative names for search matching
  
  -- Classification
  source_type TEXT NOT NULL DEFAULT 'common' -- 'branded' | 'common' | 'user' | 'provisional'
    CHECK (source_type IN ('branded', 'common', 'user', 'provisional')),
  source_provider TEXT,                      -- 'internal' | 'usda' | 'open_food_facts' | etc.
  source_id TEXT,                            -- External ID from provider (if applicable)
  
  -- UPC / Barcode
  upc TEXT,                                  -- Universal Product Code (for branded items)
  
  -- Serving information (anchored to grams)
  serving_size_g NUMERIC NOT NULL DEFAULT 100,           -- Base serving in grams
  serving_unit TEXT NOT NULL DEFAULT 'g',                -- Display unit (g, ml, oz, cup, etc.)
  serving_description TEXT,                              -- e.g., "1 cup (240g)", "1 bar (40g)"
  household_serving_text TEXT,                           -- e.g., "1 medium apple"
  
  -- Nutrients per serving (per serving_size_g)
  calories NUMERIC,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  fiber_g NUMERIC,
  sugar_g NUMERIC,
  sodium_mg NUMERIC,
  
  -- Extended nutrients (JSONB for flexibility)
  nutrients_extended JSONB DEFAULT '{}',     -- { vitamin_a_iu, vitamin_c_mg, calcium_mg, ... }
  
  -- Provenance + Confidence
  nutrient_provenance TEXT DEFAULT 'internal' -- Where nutrient data came from
    CHECK (nutrient_provenance IN ('internal', 'usda', 'label', 'estimated', 'user')),
  nutrient_confidence TEXT DEFAULT 'medium'   -- How reliable is the data
    CHECK (nutrient_confidence IN ('high', 'medium', 'low')),
  
  -- Ownership (for user-created foods)
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  
  -- Flags
  is_verified BOOLEAN NOT NULL DEFAULT false,  -- Admin-verified data
  is_deleted BOOLEAN NOT NULL DEFAULT false,   -- Soft delete
  
  -- Metadata
  image_url TEXT,
  category TEXT,                               -- e.g., 'Fruits', 'Dairy', 'Snacks'
  tags TEXT[] DEFAULT '{}',                    -- e.g., ['vegan', 'gluten-free', 'organic']
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for search and lookup
CREATE INDEX IF NOT EXISTS idx_food_objects_canonical_name ON public.food_objects USING gin(to_tsvector('english', canonical_name));
CREATE INDEX IF NOT EXISTS idx_food_objects_brand_name ON public.food_objects USING gin(to_tsvector('english', brand_name)) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_objects_upc ON public.food_objects(upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_objects_source_type ON public.food_objects(source_type);
CREATE INDEX IF NOT EXISTS idx_food_objects_person_id ON public.food_objects(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_objects_category ON public.food_objects(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_objects_is_deleted ON public.food_objects(is_deleted);

-- Unique constraint on UPC (only one canonical record per barcode)
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_objects_upc_unique ON public.food_objects(upc) WHERE upc IS NOT NULL AND is_deleted = false;

-- Enable RLS
ALTER TABLE public.food_objects ENABLE ROW LEVEL SECURITY;

-- Everyone can read non-deleted, non-user foods
CREATE POLICY "Anyone can read public foods"
  ON public.food_objects FOR SELECT
  USING (is_deleted = false AND (source_type != 'user' OR person_id IS NULL));

-- Users can read their own foods
CREATE POLICY "Users can read own foods"
  ON public.food_objects FOR SELECT
  USING (person_id = (SELECT id FROM people WHERE auth_user_id = auth.uid()));

-- Service role can manage all
CREATE POLICY "Service role can manage food_objects"
  ON public.food_objects FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- user_food_preferences
-- User's favorited/hidden foods and custom serving sizes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_food_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  food_object_id UUID NOT NULL REFERENCES public.food_objects(id) ON DELETE CASCADE,
  
  -- Preference flags
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  
  -- Custom serving (user's preferred portion)
  custom_serving_size_g NUMERIC,
  custom_serving_description TEXT,
  
  -- Usage tracking (for "Your Foods" ranking)
  log_count INTEGER NOT NULL DEFAULT 0,
  last_logged_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(person_id, food_object_id)
);

CREATE INDEX IF NOT EXISTS idx_user_food_prefs_person ON public.user_food_preferences(person_id);
CREATE INDEX IF NOT EXISTS idx_user_food_prefs_favorites ON public.user_food_preferences(person_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_food_prefs_log_count ON public.user_food_preferences(person_id, log_count DESC);

ALTER TABLE public.user_food_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own food preferences"
  ON public.user_food_preferences FOR ALL
  USING (person_id = (SELECT id FROM people WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role can manage food preferences"
  ON public.user_food_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- food_search_log (for async enrichment queue / analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.food_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  
  search_type TEXT NOT NULL CHECK (search_type IN ('text', 'upc')),
  query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  selected_food_id UUID REFERENCES public.food_objects(id),
  
  -- For UPC lookups that need async enrichment
  needs_enrichment BOOLEAN NOT NULL DEFAULT false,
  enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_search_log_enrichment ON public.food_search_log(needs_enrichment, enrichment_status) WHERE needs_enrichment = true;
CREATE INDEX IF NOT EXISTS idx_food_search_log_person ON public.food_search_log(person_id) WHERE person_id IS NOT NULL;

ALTER TABLE public.food_search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage food_search_log"
  ON public.food_search_log FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Trigger: update updated_at on food_objects
-- ============================================================================
CREATE OR REPLACE FUNCTION update_food_objects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_objects_updated_at ON public.food_objects;
CREATE TRIGGER food_objects_updated_at
  BEFORE UPDATE ON public.food_objects
  FOR EACH ROW EXECUTE FUNCTION update_food_objects_updated_at();

DROP TRIGGER IF EXISTS user_food_prefs_updated_at ON public.user_food_preferences;
CREATE TRIGGER user_food_prefs_updated_at
  BEFORE UPDATE ON public.user_food_preferences
  FOR EACH ROW EXECUTE FUNCTION update_food_objects_updated_at();

-- ============================================================================
-- Seed: Sample foods for testing (can be removed in production)
-- ============================================================================
INSERT INTO public.food_objects (canonical_name, brand_name, source_type, serving_size_g, serving_unit, serving_description, calories, protein_g, carbs_g, fat_g, fiber_g, category, nutrient_confidence, is_verified)
VALUES
  -- Common foods (Group C)
  ('Apple', NULL, 'common', 182, 'medium', '1 medium (182g)', 95, 0.5, 25, 0.3, 4.4, 'Fruits', 'high', true),
  ('Banana', NULL, 'common', 118, 'medium', '1 medium (118g)', 105, 1.3, 27, 0.4, 3.1, 'Fruits', 'high', true),
  ('Chicken Breast', NULL, 'common', 100, 'g', '100g cooked', 165, 31, 0, 3.6, 0, 'Protein', 'high', true),
  ('Brown Rice', NULL, 'common', 195, 'cup', '1 cup cooked (195g)', 216, 5, 45, 1.8, 3.5, 'Grains', 'high', true),
  ('Broccoli', NULL, 'common', 91, 'cup', '1 cup chopped (91g)', 31, 2.5, 6, 0.3, 2.4, 'Vegetables', 'high', true),
  ('Egg', NULL, 'common', 50, 'large', '1 large egg (50g)', 72, 6.3, 0.4, 5, 0, 'Protein', 'high', true),
  ('Whole Milk', NULL, 'common', 244, 'cup', '1 cup (244ml)', 149, 8, 12, 8, 0, 'Dairy', 'high', true),
  ('Greek Yogurt', NULL, 'common', 170, 'container', '1 container (170g)', 100, 17, 6, 0.7, 0, 'Dairy', 'high', true),
  ('Almonds', NULL, 'common', 28, 'oz', '1 oz (28g, ~23 almonds)', 164, 6, 6, 14, 3.5, 'Nuts & Seeds', 'high', true),
  ('Salmon', NULL, 'common', 100, 'g', '100g cooked', 208, 20, 0, 13, 0, 'Protein', 'high', true),
  ('Oatmeal', NULL, 'common', 234, 'cup', '1 cup cooked (234g)', 158, 6, 27, 3.2, 4, 'Grains', 'high', true),
  ('Avocado', NULL, 'common', 150, 'medium', '1 medium (150g)', 240, 3, 12, 22, 10, 'Fruits', 'high', true),
  ('Sweet Potato', NULL, 'common', 130, 'medium', '1 medium (130g)', 103, 2.3, 24, 0.1, 3.8, 'Vegetables', 'high', true),
  ('Spinach', NULL, 'common', 30, 'cup', '1 cup raw (30g)', 7, 0.9, 1.1, 0.1, 0.7, 'Vegetables', 'high', true),
  ('Black Beans', NULL, 'common', 172, 'cup', '1 cup cooked (172g)', 227, 15, 41, 0.9, 15, 'Legumes', 'high', true),
  
  -- Sample branded foods (Group B)
  ('Protein Bar', 'RXBAR', 'branded', 52, 'bar', '1 bar (52g)', 210, 12, 23, 9, 5, 'Snacks', 'high', true),
  ('Almond Milk', 'Califia Farms', 'branded', 240, 'cup', '1 cup (240ml)', 35, 1, 1, 2.5, 0, 'Dairy Alternatives', 'high', true),
  ('Sparkling Water', 'LaCroix', 'branded', 355, 'can', '1 can (355ml)', 0, 0, 0, 0, 0, 'Beverages', 'high', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE public.food_objects IS 'Canonical food items for journal logging. Includes branded, common, and user-created foods.';
COMMENT ON TABLE public.user_food_preferences IS 'User preferences for foods: favorites, hidden, custom servings, usage tracking.';
COMMENT ON TABLE public.food_search_log IS 'Search/scan history for analytics and async enrichment queue.';

-- ============================================================================
-- OFF Mirror Tables — Phase 1
-- Run this in Supabase Dashboard → SQL Editor
--
-- Isolated from curated/core foods. No integration with food_objects or search.
-- ============================================================================

-- ============================================================================
-- off_import_runs
-- Tracks each import run with counts and status
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.off_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_kept_us INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error_summary TEXT,
  source_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_off_import_runs_started ON public.off_import_runs(started_at DESC);

COMMENT ON TABLE public.off_import_runs IS 'Tracks Open Food Facts import runs. Phase 1 only.';

-- ============================================================================
-- off_products_mirror
-- Mirrored OFF products (U.S.-only), normalized fields + raw payload
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.off_products_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  off_product_id TEXT NOT NULL UNIQUE,
  barcode TEXT,
  product_name TEXT,
  generic_name TEXT,
  brands TEXT,
  brand_owner TEXT,
  quantity TEXT,
  serving_size TEXT,
  categories TEXT,
  categories_tags TEXT[],
  countries TEXT,
  countries_tags TEXT[],
  ingredients_text TEXT,
  allergens TEXT,
  labels TEXT[],
  image_url TEXT,
  image_front_url TEXT,
  image_nutrition_url TEXT,
  energy_kcal_100g NUMERIC,
  protein_g_100g NUMERIC,
  carbs_g_100g NUMERIC,
  fat_g_100g NUMERIC,
  fiber_g_100g NUMERIC,
  sugars_g_100g NUMERIC,
  sodium_mg_100g NUMERIC,
  salt_g_100g NUMERIC,
  nutriscore_grade TEXT,
  nova_group INTEGER,
  ecoscore_grade TEXT,
  off_created_t BIGINT,
  off_last_modified_t BIGINT,
  raw_off_payload JSONB,
  import_run_id UUID REFERENCES public.off_import_runs(id) ON DELETE SET NULL,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_off_products_mirror_barcode ON public.off_products_mirror(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_off_products_mirror_product_name ON public.off_products_mirror USING gin(to_tsvector('english', product_name)) WHERE product_name IS NOT NULL;

COMMENT ON TABLE public.off_products_mirror IS 'Open Food Facts product mirror. U.S.-only. Isolated from food_objects.';

-- ============================================================================
-- off_product_search_aliases
-- Simple alias table for local query checks (product_name, generic_name, brands, barcode)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.off_product_search_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  off_product_id TEXT NOT NULL REFERENCES public.off_products_mirror(off_product_id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('product_name', 'generic_name', 'brands', 'barcode')),
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_off_product_search_aliases_off_product_id ON public.off_product_search_aliases(off_product_id);
CREATE INDEX IF NOT EXISTS idx_off_product_search_aliases_value ON public.off_product_search_aliases USING gin(to_tsvector('english', value));

COMMENT ON TABLE public.off_product_search_aliases IS 'Search alias strings for OFF mirror. Phase 1 query support.';

-- ============================================================================
-- Add market confidence to OFF mirror rows
-- Run after createOffMirrorTables.sql
-- ============================================================================

ALTER TABLE public.off_products_mirror
  ADD COLUMN IF NOT EXISTS market_confidence TEXT;

UPDATE public.off_products_mirror
SET market_confidence = COALESCE(market_confidence, 'unknown');

ALTER TABLE public.off_products_mirror
  ALTER COLUMN market_confidence SET DEFAULT 'unknown',
  ALTER COLUMN market_confidence SET NOT NULL;

ALTER TABLE public.off_products_mirror
  DROP CONSTRAINT IF EXISTS off_products_mirror_market_confidence_check;

ALTER TABLE public.off_products_mirror
  ADD CONSTRAINT off_products_mirror_market_confidence_check
  CHECK (market_confidence IN ('explicit_us', 'likely_us', 'known_non_us', 'unknown'));

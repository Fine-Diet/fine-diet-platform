-- ============================================================================
-- Add canonical grams column to journal_entries
-- Run in Supabase Dashboard → SQL Editor
--
-- quantity_g stores the total grams for this entry, computed server-side:
--   - unit='serving': quantity_g = payload.quantity * servingSizeG
--   - unit='g':       quantity_g = the gram value directly
--   - NULL if conversion data is unavailable
--
-- payload.quantity remains the serving multiplier for all nutrition math.
-- quantity_g is a derived column for canonical weight tracking.
-- ============================================================================

ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS quantity_g NUMERIC;

COMMENT ON COLUMN public.journal_entries.quantity_g IS
  'Canonical grams for this entry. Computed server-side from payload.quantity * servingSizeG (serving mode) or stored directly (gram mode). NULL when conversion data is unavailable.';

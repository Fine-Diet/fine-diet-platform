-- Packet 20: journal-annual temporarily grants Baseline access until
-- Baseline has a standalone offer.
--
-- Idempotent data migration:
-- - Keeps the existing journal entitlement mapping intact.
-- - Reactivates an inactive program:baseline mapping if present.
-- - Inserts the mapping only when the journal-annual offer exists.

WITH reactivated AS (
  UPDATE public.offer_entitlements
  SET is_active = true,
      duration_days = NULL,
      updated_at = NOW()
  WHERE offer_key = 'journal-annual'
    AND entitlement_key = 'program:baseline'
    AND is_active = false
  RETURNING offer_key, entitlement_key
)
INSERT INTO public.offer_entitlements (
  offer_key,
  entitlement_key,
  duration_days,
  is_active
)
SELECT
  'journal-annual',
  'program:baseline',
  NULL,
  true
WHERE EXISTS (
  SELECT 1 FROM public.offers WHERE offer_key = 'journal-annual'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.offer_entitlements
  WHERE offer_key = 'journal-annual'
    AND entitlement_key = 'program:baseline'
    AND is_active = true
);

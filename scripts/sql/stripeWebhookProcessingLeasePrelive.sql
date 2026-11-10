-- Pre-live additive webhook receipt/claim schema. Do NOT apply without
-- reviewing the matching application code and testing retries on an isolated DB.
-- Existing stripe_events and processed history remain unchanged.
BEGIN;
ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS processing_token text,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at timestamptz;

COMMENT ON COLUMN public.stripe_events.processing_token IS
  'Private receipt claim token for a single webhook delivery attempt.';
COMMENT ON COLUMN public.stripe_events.processing_lease_expires_at IS
  'Failed/incomplete deliveries become reclaimable after this timestamp.';

-- No extra SELECT or UPDATE permissions for anon/authenticated.
-- The pre-existing service-role policy continues to govern these columns.
COMMIT;

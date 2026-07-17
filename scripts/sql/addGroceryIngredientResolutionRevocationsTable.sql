-- ============================================================================
-- Preview/Production migration — grocery ingredient resolution revocations
--
-- Idempotent DDL for deliberate user reversals. Safe to re-run.
-- Does not backfill legacy resolutions for keys with existing tombstones.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_ingredient_resolution_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_ingredient_resolution_revocations_person_key_unique
    UNIQUE (person_id, key)
);

CREATE INDEX IF NOT EXISTS idx_grocery_resolution_revocations_person
  ON public.grocery_ingredient_resolution_revocations (person_id, revoked_at DESC);

COMMENT ON TABLE public.grocery_ingredient_resolution_revocations IS
  'Authoritative tombstones for user-reversed grocery ingredient resolutions.';

ALTER TABLE public.grocery_ingredient_resolution_revocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;
DROP POLICY IF EXISTS "Users can insert own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;
DROP POLICY IF EXISTS "Users can delete own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;

CREATE POLICY "Users can read own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can insert own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can delete own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- Remove any table-backed resolutions that already have tombstones (repair pass).
DELETE FROM public.grocery_ingredient_resolutions AS resolution_row
USING public.grocery_ingredient_resolution_revocations AS revoked
WHERE resolution_row.person_id = revoked.person_id
  AND resolution_row.key = revoked.key;

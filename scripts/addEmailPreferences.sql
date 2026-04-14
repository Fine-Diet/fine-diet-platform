-- ============================================================================
-- Add email_preferences table
-- Fine-grained email topic preferences per person (one row per person).
--
-- Run after createPeopleSystemTables.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  -- Topic opt-in flags (accumulate: once true, stays true unless unsubscribed)
  product_updates    BOOLEAN NOT NULL DEFAULT false,
  nutrition_insights BOOLEAN NOT NULL DEFAULT false,
  program_offers     BOOLEAN NOT NULL DEFAULT false,
  early_access       BOOLEAN NOT NULL DEFAULT false,

  -- Compliance timestamps (set by admin/preference-management flows)
  double_opt_in_confirmed_at TIMESTAMPTZ,
  unsubscribe_all_at         TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per person
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_preferences_person_id
  ON public.email_preferences (person_id);

-- Index for unsubscribe lookups
CREATE INDEX IF NOT EXISTS idx_email_preferences_unsubscribed
  ON public.email_preferences (unsubscribe_all_at)
  WHERE unsubscribe_all_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage email_preferences"
  ON public.email_preferences FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.email_preferences IS
  'Fine-grained email topic preferences per person. One row per person. '
  'Boolean flags only turn ON via signup flows; set unsubscribe_all_at to suppress all sends.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_preferences TO service_role;

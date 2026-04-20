-- ============================================================================
-- body_measurements — historical body metrics for Plans inputs
--
-- Stores time-series measurements (weight, height, body fat %, waist, etc.).
-- people.metadata holds only the *latest* cached values (weight_kg,
-- height_cm, weight_as_of); this table is the source of truth for history
-- and trending.
--
-- Additive only. No changes to the people table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  measurement_type TEXT NOT NULL
    CHECK (measurement_type IN (
      'weight',
      'height',
      'body_fat_percent',
      'waist_cm',
      'hip_cm',
      'neck_cm',
      'other'
    )),

  -- Canonical numeric value in the canonical unit for this type.
  -- For 'weight' store kilograms; for 'height' store centimeters;
  -- for 'body_fat_percent' store 0-100.
  value_numeric NUMERIC(10,3) NOT NULL,
  unit TEXT NOT NULL,

  -- Optional: what the user entered in their preferred display unit
  -- (e.g. 180 lb, 5'11"). Canonical value above is authoritative.
  display_value_numeric NUMERIC(10,3),
  display_unit TEXT,

  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'device', 'estimate', 'import')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_person_type_time
  ON public.body_measurements (person_id, measurement_type, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_body_measurements_person_time
  ON public.body_measurements (person_id, measured_at DESC);

COMMENT ON TABLE public.body_measurements IS
  'Time-series body measurements. Latest cached values live on people.metadata; this table is the history source of truth.';

-- ============================================================================
-- Row Level Security — mirrors journal_entries
-- ============================================================================

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own body_measurements" ON public.body_measurements
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own body_measurements" ON public.body_measurements
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own body_measurements" ON public.body_measurements
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own body_measurements" ON public.body_measurements
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- updated_at trigger — reuse update_journal_updated_at() fn from
-- scripts/createJournalTables.sql.
-- ============================================================================

DROP TRIGGER IF EXISTS body_measurements_updated_at ON public.body_measurements;
CREATE TRIGGER body_measurements_updated_at
  BEFORE UPDATE ON public.body_measurements
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ============================================================================
-- Verification
-- ============================================================================

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'body_measurements'
-- ORDER BY ordinal_position;

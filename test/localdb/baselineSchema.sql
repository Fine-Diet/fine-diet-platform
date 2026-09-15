-- ============================================================================
-- NDS-01A local fixture: pre-correction baseline schema
-- ============================================================================
--
-- Reproduces the upstream objects the NDS migrations depend on, so the migration
-- and cutover steps can be applied and rehearsed against a real PostgreSQL
-- server. Assembled from the repository's own SQL history, NOT read from any
-- remote database:
--
--   scripts/createJournalTables.sql          journal_entries, RLS shape
--   scripts/sql/addJournalEntryQuantityG.sql quantity_g
--   scripts/sql/createDailyNDSTables.sql     daily_nds, nds_recompute_queue,
--                                            legacy enqueue trigger, meal columns
--   scripts/createFoodObjectsTables.sql      food_objects columns read by
--                                            loadFoodEvidence
--
-- Only the columns the NDS read/write paths actually touch are reproduced. This
-- is a fixture for behaviour under real concurrency and real privileges, not a
-- claim to mirror production byte for byte. Divergences are recorded in the
-- evidence manifest.
-- ============================================================================

-- Supabase-provided roles. Recreated locally so grant/RLS behaviour can be
-- exercised as the browser roles rather than only as the owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ============================================================================
-- auth schema stub
-- ============================================================================
-- RLS policies call auth.uid(). Locally it reads a session GUC, which is how a
-- test impersonates a signed-in subject without a real JWT. This mirrors the
-- contract the policies rely on; it is not an authentication bypass in the
-- application, and nothing in the app imports it.

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ============================================================================
-- people
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_select_self ON public.people;
CREATE POLICY people_select_self ON public.people
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

GRANT SELECT ON public.people TO authenticated;

-- ============================================================================
-- journal_entries
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'intake',
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_person_occurred
  ON public.journal_entries (person_id, occurred_at);

-- scripts/sql/addJournalEntryQuantityG.sql
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS quantity_g NUMERIC;

-- scripts/sql/createDailyNDSTables.sql section 4
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS protein_score_10 NUMERIC(4,2)
    CHECK (protein_score_10 >= 0 AND protein_score_10 <= 10);
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS is_main_meal BOOLEAN DEFAULT FALSE;
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS meal_derived_data JSONB;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_select_own ON public.journal_entries;
CREATE POLICY journal_entries_select_own ON public.journal_entries
  FOR SELECT TO authenticated
  USING (person_id IN (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS journal_entries_insert_own ON public.journal_entries;
CREATE POLICY journal_entries_insert_own ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (person_id IN (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS journal_entries_update_own ON public.journal_entries;
CREATE POLICY journal_entries_update_own ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (person_id IN (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS journal_entries_delete_own ON public.journal_entries;
CREATE POLICY journal_entries_delete_own ON public.journal_entries
  FOR DELETE TO authenticated
  USING (person_id IN (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;

-- ============================================================================
-- daily_nds (PRE-CORRECTION shape)
-- ============================================================================
-- NOT NULL on the score and every subscore is reproduced deliberately: it is the
-- storage-level reason a non-numeric day could not be represented without
-- writing a zero. ndsIntegrityV1_02 relaxes it under a state-conditional check.

CREATE TABLE IF NOT EXISTS public.daily_nds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  nds_score_100 NUMERIC(5,2) NOT NULL CHECK (nds_score_100 >= 0 AND nds_score_100 <= 100),
  wfr_10 NUMERIC(4,2) NOT NULL CHECK (wfr_10 >= 0 AND wfr_10 <= 10),
  ps_10  NUMERIC(4,2) NOT NULL CHECK (ps_10  >= 0 AND ps_10  <= 10),
  pnd_10 NUMERIC(4,2) NOT NULL CHECK (pnd_10 >= 0 AND pnd_10 <= 10),
  fp_10  NUMERIC(4,2) NOT NULL CHECK (fp_10  >= 0 AND fp_10  <= 10),
  as_10  NUMERIC(4,2) NOT NULL CHECK (as_10  >= 0 AND as_10  <= 10),
  mnc_10 NUMERIC(4,2) NOT NULL CHECK (mnc_10 >= 0 AND mnc_10 <= 10),
  ob_10  NUMERIC(4,2) NOT NULL CHECK (ob_10  >= 0 AND ob_10  <= 10),
  debug_data JSONB,
  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_nds_person_date
  ON public.daily_nds (person_id, date_local);

-- ============================================================================
-- nds_recompute_queue (legacy) and its enqueue trigger
-- ============================================================================
-- Reproduced verbatim in shape so the R09 cutover is rehearsed against the real
-- legacy artifact, including its UNIQUE (person_id, date_local, status).

CREATE TABLE IF NOT EXISTS public.nds_recompute_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE (person_id, date_local, status)
);

CREATE OR REPLACE FUNCTION public.enqueue_nds_recompute()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  new_date DATE;
  person_uuid UUID;
  scheduled_time TIMESTAMPTZ;
BEGIN
  scheduled_time := NOW() + INTERVAL '5 seconds';

  IF TG_OP = 'DELETE' THEN
    person_uuid := OLD.person_id;
    old_date := (OLD.occurred_at AT TIME ZONE 'UTC')::DATE;
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, old_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) DO UPDATE
      SET scheduled_for = GREATEST(public.nds_recompute_queue.scheduled_for, scheduled_time),
          enqueued_at = NOW();
  ELSIF TG_OP = 'INSERT' THEN
    person_uuid := NEW.person_id;
    new_date := (NEW.occurred_at AT TIME ZONE 'UTC')::DATE;
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, new_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) DO UPDATE
      SET scheduled_for = GREATEST(public.nds_recompute_queue.scheduled_for, scheduled_time),
          enqueued_at = NOW();
  ELSIF TG_OP = 'UPDATE' THEN
    person_uuid := NEW.person_id;
    old_date := (OLD.occurred_at AT TIME ZONE 'UTC')::DATE;
    new_date := (NEW.occurred_at AT TIME ZONE 'UTC')::DATE;
    INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
    VALUES (person_uuid, new_date, scheduled_time)
    ON CONFLICT (person_id, date_local, status) DO UPDATE
      SET scheduled_for = GREATEST(public.nds_recompute_queue.scheduled_for, scheduled_time),
          enqueued_at = NOW();
    IF old_date <> new_date THEN
      INSERT INTO public.nds_recompute_queue (person_id, date_local, scheduled_for)
      VALUES (person_uuid, old_date, scheduled_time)
      ON CONFLICT (person_id, date_local, status) DO UPDATE
        SET scheduled_for = GREATEST(public.nds_recompute_queue.scheduled_for, scheduled_time),
            enqueued_at = NOW();
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute ON public.journal_entries;
CREATE TRIGGER trigger_enqueue_nds_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_nds_recompute();

-- ============================================================================
-- food_objects
-- ============================================================================
-- Only the columns lib/nds/ndsPersistenceSupabase.ts loadFoodEvidence selects.

CREATE TABLE IF NOT EXISTS public.food_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  brand_name TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  calories NUMERIC,
  protein_g NUMERIC,
  fiber_g NUMERIC,
  sugar_g NUMERIC,
  sodium_mg NUMERIC,
  potassium_mg NUMERIC,
  magnesium_mg NUMERIC,
  iron_mg NUMERIC,
  calcium_mg NUMERIC,
  zinc_mg NUMERIC,
  folate_ug NUMERIC,
  vitamin_a_ug_rae NUMERIC,
  vitamin_c_mg NUMERIC,
  vitamin_d_ug NUMERIC,
  vitamin_b12_ug NUMERIC,
  processing_class TEXT,
  processing_class_override TEXT,
  nutrients_extended JSONB,
  source_dataset TEXT,
  serving_size_g NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT ON public.food_objects TO authenticated, anon;

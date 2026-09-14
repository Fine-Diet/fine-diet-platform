-- Minimal Plans + library tables for NDS-01C remaining A03 handlers.
-- Applied only to the run-owned local G1 cluster.

ALTER TABLE public.food_objects ADD COLUMN IF NOT EXISTS measures JSONB;

CREATE TABLE IF NOT EXISTS public.journal_meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  nutrition_density INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title TEXT,
  plan_shape TEXT NOT NULL DEFAULT 'day',
  source TEXT NOT NULL DEFAULT 'user_manual',
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE,
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planned_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  plan_day_id UUID NOT NULL REFERENCES public.plan_days(id) ON DELETE CASCADE,
  plan_slot_id UUID,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  name TEXT,
  meal_type TEXT NOT NULL DEFAULT 'other',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  protein_score_10 NUMERIC(4,2),
  is_main_meal BOOLEAN NOT NULL DEFAULT FALSE,
  psq_multiplier NUMERIC(3,2) DEFAULT 1,
  meal_derived_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  nds_confidence TEXT NOT NULL DEFAULT 'high',
  source_template_id UUID,
  source_imported_meal_id UUID,
  reusable_provenance JSONB,
  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  execution_state TEXT NOT NULL DEFAULT 'pending',
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_meal_templates TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_days TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_meals TO service_role, authenticated;

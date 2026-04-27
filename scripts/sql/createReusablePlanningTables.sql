-- ============================================================================
-- Packet 56 — Reusable Planning Tables
--
-- Moves reusable day templates and week patterns out of people.metadata and
-- into dedicated tables while preserving snapshot semantics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reusable_plan_day_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  source_plan_id UUID NOT NULL,
  source_plan_day_id UUID NOT NULL,
  source_date_local DATE NOT NULL,

  slots_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(slots_json) = 'array'),
  unassigned_meals_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(unassigned_meals_json) = 'array'),

  apply_policy TEXT NOT NULL DEFAULT 'append'
    CHECK (apply_policy IN ('append')),
  storage_source TEXT NOT NULL DEFAULT 'table_direct'
    CHECK (storage_source IN ('table_direct', 'legacy_metadata')),
  legacy_metadata_backfilled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reusable_day_templates_person_updated
  ON public.reusable_plan_day_templates (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reusable_day_templates_source_day
  ON public.reusable_plan_day_templates (source_plan_day_id);

COMMENT ON TABLE public.reusable_plan_day_templates IS
  'Reusable day-template snapshots for Plans. Table-backed replacement for people.metadata.plan_day_templates.';

COMMENT ON COLUMN public.reusable_plan_day_templates.slots_json IS
  'Snapshot of source slots and template meals. Not a live alias to plan_slots or planned_meals.';

CREATE TABLE IF NOT EXISTS public.reusable_plan_week_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  source_plan_id UUID NOT NULL,
  source_date_start DATE NOT NULL,
  source_date_end DATE NOT NULL,

  days_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(days_json) = 'array'),

  apply_policy TEXT NOT NULL DEFAULT 'append'
    CHECK (apply_policy IN ('append')),
  storage_source TEXT NOT NULL DEFAULT 'table_direct'
    CHECK (storage_source IN ('table_direct', 'legacy_metadata')),
  legacy_metadata_backfilled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reusable_week_patterns_person_updated
  ON public.reusable_plan_week_patterns (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reusable_week_patterns_source_plan
  ON public.reusable_plan_week_patterns (source_plan_id);

COMMENT ON TABLE public.reusable_plan_week_patterns IS
  'Reusable multi-day/week-pattern snapshots for Plans. Table-backed replacement for people.metadata.plan_week_patterns.';

COMMENT ON COLUMN public.reusable_plan_week_patterns.days_json IS
  'Snapshot of source days, slots, and template meals. Not a live alias to source plan rows.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.reusable_plan_day_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reusable_plan_week_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates;
DROP POLICY IF EXISTS "Users can insert own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates;
DROP POLICY IF EXISTS "Users can update own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates;
DROP POLICY IF EXISTS "Users can delete own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates;

CREATE POLICY "Users can read own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own reusable_plan_day_templates"
  ON public.reusable_plan_day_templates
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns;
DROP POLICY IF EXISTS "Users can insert own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns;
DROP POLICY IF EXISTS "Users can update own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns;
DROP POLICY IF EXISTS "Users can delete own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns;

CREATE POLICY "Users can read own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own reusable_plan_week_patterns"
  ON public.reusable_plan_week_patterns
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- updated_at triggers
-- ============================================================================

DROP TRIGGER IF EXISTS reusable_plan_day_templates_updated_at
  ON public.reusable_plan_day_templates;
CREATE TRIGGER reusable_plan_day_templates_updated_at
  BEFORE UPDATE ON public.reusable_plan_day_templates
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS reusable_plan_week_patterns_updated_at
  ON public.reusable_plan_week_patterns;
CREATE TRIGGER reusable_plan_week_patterns_updated_at
  BEFORE UPDATE ON public.reusable_plan_week_patterns
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ============================================================================
-- Legacy metadata backfill
-- ============================================================================

INSERT INTO public.reusable_plan_day_templates (
  id,
  person_id,
  name,
  source_plan_id,
  source_plan_day_id,
  source_date_local,
  slots_json,
  unassigned_meals_json,
  apply_policy,
  storage_source,
  legacy_metadata_backfilled_at,
  created_at,
  updated_at
)
SELECT
  (template->>'id')::uuid,
  people.id,
  template->>'name',
  (template->>'source_plan_id')::uuid,
  (template->>'source_plan_day_id')::uuid,
  (template->>'source_date_local')::date,
  COALESCE(template->'slots', '[]'::jsonb),
  COALESCE(template->'unassigned_meals', '[]'::jsonb),
  COALESCE(template->>'apply_policy', 'append'),
  'legacy_metadata',
  now(),
  CASE
    WHEN (template->>'created_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (template->>'created_at')::timestamptz
    ELSE now()
  END,
  CASE
    WHEN (template->>'updated_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (template->>'updated_at')::timestamptz
    ELSE now()
  END
FROM public.people
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(people.metadata->'plan_day_templates') = 'array'
      THEN people.metadata->'plan_day_templates'
    ELSE '[]'::jsonb
  END
) AS template
WHERE template ? 'id'
  AND template ? 'name'
  AND template ? 'source_plan_id'
  AND template ? 'source_plan_day_id'
  AND template ? 'source_date_local'
  AND (template->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (template->>'source_plan_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (template->>'source_plan_day_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (template->>'source_date_local') ~ '^\d{4}-\d{2}-\d{2}$'
  AND COALESCE(template->>'scope', 'day') = 'day'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reusable_plan_week_patterns (
  id,
  person_id,
  name,
  source_plan_id,
  source_date_start,
  source_date_end,
  days_json,
  apply_policy,
  storage_source,
  legacy_metadata_backfilled_at,
  created_at,
  updated_at
)
SELECT
  (pattern->>'id')::uuid,
  people.id,
  pattern->>'name',
  (pattern->>'source_plan_id')::uuid,
  (pattern->>'source_date_start')::date,
  (pattern->>'source_date_end')::date,
  COALESCE(pattern->'days', '[]'::jsonb),
  COALESCE(pattern->>'apply_policy', 'append'),
  'legacy_metadata',
  now(),
  CASE
    WHEN (pattern->>'created_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (pattern->>'created_at')::timestamptz
    ELSE now()
  END,
  CASE
    WHEN (pattern->>'updated_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (pattern->>'updated_at')::timestamptz
    ELSE now()
  END
FROM public.people
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(people.metadata->'plan_week_patterns') = 'array'
      THEN people.metadata->'plan_week_patterns'
    ELSE '[]'::jsonb
  END
) AS pattern
WHERE pattern ? 'id'
  AND pattern ? 'name'
  AND pattern ? 'source_plan_id'
  AND pattern ? 'source_date_start'
  AND pattern ? 'source_date_end'
  AND (pattern->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (pattern->>'source_plan_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (pattern->>'source_date_start') ~ '^\d{4}-\d{2}-\d{2}$'
  AND (pattern->>'source_date_end') ~ '^\d{4}-\d{2}-\d{2}$'
  AND COALESCE(pattern->>'scope', 'week_pattern') = 'week_pattern'
ON CONFLICT (id) DO NOTHING;

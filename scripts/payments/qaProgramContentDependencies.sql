-- Payments QA ONLY: additive member-content dependencies missing from the
-- intentionally small 20-table QA schema. Reviewed against the production
-- definitions in addPlansPhase12ProgramContentTables.sql,
-- addPlansPhase13ProgramProgressTable.sql, and
-- addProgramDeliveryModulesTable.sql. This creates no user, payment, offer,
-- entitlement, program, or content rows and does not alter existing objects.
-- Target Supabase project: ikvkqpbwlpevqlshdkdz.
BEGIN;

CREATE TABLE IF NOT EXISTS public.program_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  ordinal integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_modules_program_ord
  ON public.program_modules (program_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_program_modules_status
  ON public.program_modules (status);
ALTER TABLE public.program_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read published program_modules"
  ON public.program_modules FOR SELECT TO authenticated
  USING (status='published' AND EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id=program_modules.program_id AND p.status='published'
  ));
GRANT SELECT ON public.program_modules TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_modules TO service_role;

CREATE TABLE IF NOT EXISTS public.program_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.program_modules(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('article','guidance','video','milestone')),
  title text NOT NULL,
  summary text,
  body text,
  video_url text,
  video_provider text,
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes>=0),
  ordinal integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_content_items_module_ord
  ON public.program_content_items (module_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_program_content_items_status
  ON public.program_content_items (status);
CREATE INDEX IF NOT EXISTS idx_program_content_items_type
  ON public.program_content_items (item_type);
ALTER TABLE public.program_content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read published program_content_items"
  ON public.program_content_items FOR SELECT TO authenticated
  USING (status='published' AND EXISTS (
    SELECT 1
    FROM public.program_modules m
    JOIN public.programs p ON p.id=m.program_id
    WHERE m.id=program_content_items.module_id
      AND m.status='published' AND p.status='published'
  ));
GRANT SELECT ON public.program_content_items TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_content_items TO service_role;

CREATE TABLE IF NOT EXISTS public.program_content_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_slug text NOT NULL,
  content_item_id uuid NOT NULL REFERENCES public.program_content_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_viewed_at timestamptz,
  progress_percent integer CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_content_progress_person_item_unique UNIQUE (person_id,content_item_id)
);
CREATE INDEX IF NOT EXISTS idx_program_content_progress_person_slug
  ON public.program_content_progress (person_id, program_slug);
CREATE INDEX IF NOT EXISTS idx_program_content_progress_person_status
  ON public.program_content_progress (person_id, status);
CREATE INDEX IF NOT EXISTS idx_program_content_progress_last_viewed
  ON public.program_content_progress (person_id, last_viewed_at DESC);
ALTER TABLE public.program_content_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own program_content_progress"
  ON public.program_content_progress FOR SELECT TO authenticated
  USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id=auth.uid()));
CREATE POLICY "Users can insert own program_content_progress"
  ON public.program_content_progress FOR INSERT TO authenticated
  WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id=auth.uid()));
CREATE POLICY "Users can update own program_content_progress"
  ON public.program_content_progress FOR UPDATE TO authenticated
  USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id=auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id=auth.uid()));
GRANT SELECT,INSERT,UPDATE ON public.program_content_progress TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_content_progress TO service_role;

CREATE TABLE IF NOT EXISTS public.program_delivery_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  program_version_id uuid REFERENCES public.program_versions(id) ON DELETE SET NULL,
  module_key text NOT NULL CHECK (module_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  module_type text NOT NULL CHECK (module_type IN (
    'prep','week','practice_card','guide','capacity_support','roadmap',
    'checkin_prompt','recommendation_prompt'
  )),
  title text NOT NULL,
  eyebrow text,
  body text NOT NULL DEFAULT '',
  day_start integer CHECK (day_start IS NULL OR day_start>=0),
  day_end integer CHECK (day_end IS NULL OR day_end>=0),
  status_visibility text[] NOT NULL DEFAULT ARRAY['pre_start','active']::text[]
    CHECK (status_visibility <@ ARRAY['not_started','pre_start','active','paused','completed','cancelled']::text[]),
  capacity_variants_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  cta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  anchor_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order>=0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  safety_notes text[] NOT NULL DEFAULT ARRAY[]::text[],
  no_claims_notes text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (day_start IS NULL OR day_end IS NULL OR day_start<=day_end)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_delivery_modules_key
  ON public.program_delivery_modules (
    program_id,
    COALESCE(program_version_id,'00000000-0000-0000-0000-000000000000'::uuid),
    module_key
  );
CREATE INDEX IF NOT EXISTS idx_program_delivery_modules_program_order
  ON public.program_delivery_modules (program_id,program_version_id,display_order);
CREATE INDEX IF NOT EXISTS idx_program_delivery_modules_status
  ON public.program_delivery_modules (status);
ALTER TABLE public.program_delivery_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read published program_delivery_modules"
  ON public.program_delivery_modules FOR SELECT TO authenticated
  USING (
    status='published'
    AND EXISTS (SELECT 1 FROM public.programs p
      WHERE p.id=program_delivery_modules.program_id AND p.status='published')
    AND (program_version_id IS NULL OR EXISTS (
      SELECT 1 FROM public.program_versions pv
      WHERE pv.id=program_delivery_modules.program_version_id
        AND pv.program_id=program_delivery_modules.program_id AND pv.status='published'
    ))
  );
GRANT SELECT ON public.program_delivery_modules TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_delivery_modules TO service_role;

COMMIT;

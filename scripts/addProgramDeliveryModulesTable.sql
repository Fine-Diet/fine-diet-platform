-- ============================================================================
-- Program Runtime Packet 16 — delivery module authoring foundation
--
-- Adds an additive table for admin-authored Program Delivery Modules. This does
-- not remove the existing code-owned Baseline config; runtime can prefer
-- published rows when present and safely fall back to code config otherwise.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_delivery_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  program_version_id UUID REFERENCES public.program_versions(id) ON DELETE SET NULL,

  module_key TEXT NOT NULL
    CHECK (module_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  module_type TEXT NOT NULL
    CHECK (
      module_type IN (
        'prep',
        'week',
        'practice_card',
        'guide',
        'capacity_support',
        'roadmap',
        'checkin_prompt',
        'recommendation_prompt'
      )
    ),

  title TEXT NOT NULL,
  eyebrow TEXT,
  body TEXT NOT NULL DEFAULT '',

  day_start INTEGER CHECK (day_start IS NULL OR day_start >= 0),
  day_end INTEGER CHECK (day_end IS NULL OR day_end >= 0),
  status_visibility TEXT[] NOT NULL DEFAULT ARRAY['pre_start', 'active']::TEXT[]
    CHECK (
      status_visibility <@ ARRAY[
        'not_started',
        'pre_start',
        'active',
        'paused',
        'completed',
        'cancelled'
      ]::TEXT[]
    ),

  capacity_variants_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  anchor_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  safety_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  no_claims_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (day_start IS NULL OR day_end IS NULL OR day_start <= day_end)
);

COMMENT ON TABLE public.program_delivery_modules IS
  'Packet 16: admin-authored app delivery modules. Published rows can override code-owned Baseline delivery config at runtime.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_delivery_modules_key
  ON public.program_delivery_modules (
    program_id,
    COALESCE(program_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
    module_key
  );

CREATE INDEX IF NOT EXISTS idx_program_delivery_modules_program_order
  ON public.program_delivery_modules (program_id, program_version_id, display_order);

CREATE INDEX IF NOT EXISTS idx_program_delivery_modules_status
  ON public.program_delivery_modules (status);

DROP TRIGGER IF EXISTS program_delivery_modules_updated_at
  ON public.program_delivery_modules;
CREATE TRIGGER program_delivery_modules_updated_at
  BEFORE UPDATE ON public.program_delivery_modules
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

ALTER TABLE public.program_delivery_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read published program_delivery_modules"
  ON public.program_delivery_modules FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.programs p
      WHERE p.id = program_delivery_modules.program_id
        AND p.status = 'published'
    )
    AND (
      program_version_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.program_versions pv
        WHERE pv.id = program_delivery_modules.program_version_id
          AND pv.program_id = program_delivery_modules.program_id
          AND pv.status = 'published'
      )
    )
  );

GRANT SELECT ON public.program_delivery_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_delivery_modules TO service_role;

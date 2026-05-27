-- ============================================================================
-- Fine Diet Program Runtime Contract Packet 1 — additive schema
--
-- Adds a version-locked runtime layer for guided programs. This deliberately
-- does not reshape:
--   - programs / program_modules / program_content_items (catalogue/content)
--   - program_assignments (assignment/runtime inheritance for Plans)
--   - person_entitlements (`program:<slug>` acquisition/access convention)
--   - program_content_progress (content-item progress)
--   - program_plan_guidance (Plans-only guidance)
--
-- RLS follows the existing people.auth_user_id pattern. Users can read their
-- own runtime rows; service_role administers writes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- program_versions (version lock anchor for enrollments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,

  -- Human/admin visible version identifier, e.g. "baseline-2026-01".
  version_key TEXT NOT NULL
    CHECK (version_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  version_label TEXT,
  version_number INTEGER NOT NULL DEFAULT 1
    CHECK (version_number >= 1),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- Optional program-level pacing hints. Unlock rules remain owned by the
  -- runtime/app layer and may be refined in future packets.
  duration_days INTEGER
    CHECK (duration_days IS NULL OR duration_days >= 1),
  default_unlock_day INTEGER NOT NULL DEFAULT 1
    CHECK (default_unlock_day >= 1),

  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT program_versions_program_key_unique
    UNIQUE (program_id, version_key),
  CONSTRAINT program_versions_program_number_unique
    UNIQUE (program_id, version_number)
);

COMMENT ON TABLE public.program_versions IS
  'Program Runtime Packet 1: immutable-ish version anchor used to lock a person enrollment to a guided program experience.';

CREATE INDEX IF NOT EXISTS idx_program_versions_program_status
  ON public.program_versions (program_id, status, version_number DESC);

DROP TRIGGER IF EXISTS program_versions_updated_at
  ON public.program_versions;
CREATE TRIGGER program_versions_updated_at
  BEFORE UPDATE ON public.program_versions
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_enrollments (person-specific guided-program runtime)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  program_slug TEXT NOT NULL
    CHECK (program_slug ~ '^[a-z0-9][a-z0-9-]*$'),
  program_version_id UUID NOT NULL
    REFERENCES public.program_versions(id) ON DELETE RESTRICT,

  source_type TEXT NOT NULL
    CHECK (source_type IN ('entitlement', 'assignment', 'admin_grant')),
  source_ref TEXT,
  entitlement_key TEXT,
  assignment_id UUID REFERENCES public.program_assignments(id) ON DELETE SET NULL,

  purchase_date DATE,
  selected_start_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pre_start'
    CHECK (status IN (
      'pre_start', 'active', 'paused', 'completed', 'cancelled'
    )),

  timezone TEXT NOT NULL DEFAULT 'UTC',
  current_capacity TEXT NOT NULL DEFAULT 'steady'
    CHECK (current_capacity IN ('low', 'steady', 'high')),
  paused_days_total INTEGER NOT NULL DEFAULT 0
    CHECK (paused_days_total >= 0),
  pause_until DATE,

  -- Snapshots let future recommendation engines explain what they saw at
  -- enrollment/summary time without recomputing against changed user data.
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT program_enrollments_completed_status_check
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL)
      OR status <> 'completed'
    ),
  CONSTRAINT program_enrollments_assignment_source_check
    CHECK (
      (source_type = 'assignment' AND assignment_id IS NOT NULL)
      OR source_type <> 'assignment'
    )
);

COMMENT ON TABLE public.program_enrollments IS
  'Program Runtime Packet 1: version-locked person enrollment. Separate from assignments, entitlements, progress, content, and Plans guidance.';

CREATE INDEX IF NOT EXISTS idx_program_enrollments_person_status
  ON public.program_enrollments (person_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_program_enrollments_person_slug_status
  ON public.program_enrollments (person_id, program_slug, status);

CREATE INDEX IF NOT EXISTS idx_program_enrollments_version
  ON public.program_enrollments (program_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_enrollments_one_open_per_program
  ON public.program_enrollments (person_id, program_id)
  WHERE status IN ('pre_start', 'active', 'paused');

DROP TRIGGER IF EXISTS program_enrollments_updated_at
  ON public.program_enrollments;
CREATE TRIGGER program_enrollments_updated_at
  BEFORE UPDATE ON public.program_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_checkin_templates (versioned check-ins by program day)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_checkin_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_version_id UUID NOT NULL
    REFERENCES public.program_versions(id) ON DELETE CASCADE,

  checkin_day INTEGER NOT NULL CHECK (checkin_day >= 1),
  title TEXT NOT NULL,
  description TEXT,
  prompt_md TEXT,
  questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT program_checkin_templates_version_day_unique
    UNIQUE (program_version_id, checkin_day)
);

COMMENT ON TABLE public.program_checkin_templates IS
  'Program Runtime Packet 1: versioned check-in templates keyed by guided program day.';

CREATE INDEX IF NOT EXISTS idx_program_checkin_templates_version_day
  ON public.program_checkin_templates (program_version_id, checkin_day);

DROP TRIGGER IF EXISTS program_checkin_templates_updated_at
  ON public.program_checkin_templates;
CREATE TRIGGER program_checkin_templates_updated_at
  BEFORE UPDATE ON public.program_checkin_templates
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_checkin_responses (completed or explicitly skipped check-ins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_checkin_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL
    REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  checkin_template_id UUID
    REFERENCES public.program_checkin_templates(id) ON DELETE SET NULL,

  checkin_day INTEGER NOT NULL CHECK (checkin_day >= 1),
  response_status TEXT NOT NULL
    CHECK (response_status IN ('completed', 'skipped')),

  response_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  skipped_reason TEXT,
  responded_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,

  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT program_checkin_responses_enrollment_day_unique
    UNIQUE (enrollment_id, checkin_day),
  CONSTRAINT program_checkin_responses_status_timestamp_check
    CHECK (
      (response_status = 'completed' AND responded_at IS NOT NULL)
      OR (response_status = 'skipped' AND skipped_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.program_checkin_responses IS
  'Program Runtime Packet 1: person responses to versioned check-ins, including explicit skipped check-ins.';

CREATE INDEX IF NOT EXISTS idx_program_checkin_responses_enrollment_day
  ON public.program_checkin_responses (enrollment_id, checkin_day);

DROP TRIGGER IF EXISTS program_checkin_responses_updated_at
  ON public.program_checkin_responses;
CREATE TRIGGER program_checkin_responses_updated_at
  BEFORE UPDATE ON public.program_checkin_responses
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_recommendations (stored results; engine deferred to future packet)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL
    REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  based_on_checkin_response_id UUID
    REFERENCES public.program_checkin_responses(id) ON DELETE SET NULL,

  recommendation_type TEXT NOT NULL DEFAULT 'runtime_summary',
  program_day INTEGER CHECK (program_day IS NULL OR program_day >= 1),
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'dismissed', 'applied', 'superseded')),

  recommendation_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_metrics_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_recommendations IS
  'Program Runtime Packet 1: stored recommendation results tied to an enrollment. Recommendation engine is intentionally deferred.';

CREATE INDEX IF NOT EXISTS idx_program_recommendations_enrollment_generated
  ON public.program_recommendations (enrollment_id, generated_at DESC);

DROP TRIGGER IF EXISTS program_recommendations_updated_at
  ON public.program_recommendations;
CREATE TRIGGER program_recommendations_updated_at
  BEFORE UPDATE ON public.program_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_recommendations ENABLE ROW LEVEL SECURITY;

-- Version/template reads are limited to versions the signed-in person is
-- enrolled in. Public catalogue/content remains governed by existing tables.
CREATE POLICY "Users can read own enrolled program_versions"
  ON public.program_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
      WHERE e.program_version_id = program_versions.id
        AND e.person_id IN (
          SELECT id FROM public.people WHERE auth_user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can read own program_enrollments"
  ON public.program_enrollments FOR SELECT TO authenticated
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can read own program_checkin_templates"
  ON public.program_checkin_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
      WHERE e.program_version_id = program_checkin_templates.program_version_id
        AND e.person_id IN (
          SELECT id FROM public.people WHERE auth_user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can read own program_checkin_responses"
  ON public.program_checkin_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
      WHERE e.id = program_checkin_responses.enrollment_id
        AND e.person_id IN (
          SELECT id FROM public.people WHERE auth_user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can read own program_recommendations"
  ON public.program_recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
      WHERE e.id = program_recommendations.enrollment_id
        AND e.person_id IN (
          SELECT id FROM public.people WHERE auth_user_id = auth.uid()
        )
    )
  );

-- service_role administers runtime authoring and lifecycle writes.
CREATE POLICY "Service role can administer program_versions"
  ON public.program_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can administer program_enrollments"
  ON public.program_enrollments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can administer program_checkin_templates"
  ON public.program_checkin_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can administer program_checkin_responses"
  ON public.program_checkin_responses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can administer program_recommendations"
  ON public.program_recommendations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.program_versions TO authenticated;
GRANT SELECT ON public.program_enrollments TO authenticated;
GRANT SELECT ON public.program_checkin_templates TO authenticated;
GRANT SELECT ON public.program_checkin_responses TO authenticated;
GRANT SELECT ON public.program_recommendations TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_enrollments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_checkin_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_checkin_responses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_recommendations TO service_role;

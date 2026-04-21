-- ============================================================================
-- Plans Phase 8 (Program assignment + guidance inheritance) — additive schema
--
-- Packet 8 introduces a runtime assignment layer sitting on top of the
-- existing acquisition/entitlement stack:
--
--   person_entitlements  : WHO is eligible for WHAT (acquisition layer).
--   program_assignments  : WHO is CURRENTLY RUNNING a given program, with
--                          active dates + priority (runtime/inheritance).
--   program_plan_guidance: structured directives Plans consumes, filtered
--                          through the runtime assignment layer.
--
-- RLS mirrors `program_plan_guidance`: writes go through service role,
-- direct client reads are gated on people.auth_user_id.
-- Additive only — nothing else in the schema is touched.
--
-- Run in Supabase SQL Editor OR via the `apply_migration` MCP call
-- (`add_plans_phase_8_program_assignments`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  program_slug TEXT NOT NULL,

  -- Where the assignment came from. Kept as a CHECK enum so admin
  -- reporting can be deterministic; extend with care.
  acquisition_source TEXT NOT NULL DEFAULT 'admin_grant'
    CHECK (acquisition_source IN (
      'offer', 'purchase', 'admin_grant', 'bundle', 'other'
    )),

  -- Runtime lifecycle.
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active', 'inactive', 'scheduled', 'completed', 'cancelled'
    )),

  -- Active window. active_from NULL means "applies immediately";
  -- active_to NULL means "no scheduled end".
  active_from TIMESTAMPTZ,
  active_to TIMESTAMPTZ,

  -- Merge priority hint. Higher wins when multiple assignments apply
  -- to the same person_id/program_slug pair. Default 0 keeps the
  -- resolver deterministic via updated_at tie-break.
  priority INTEGER NOT NULL DEFAULT 0,

  -- Free-form provenance: offer_key, stripe subscription id, etc.
  source_ref TEXT,
  -- Staff-only note. Distinct from any user-facing program copy.
  notes TEXT,

  -- auth.users.id of the staff/user who created the assignment.
  -- Not an FK to keep cross-schema coupling loose.
  created_by_user_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT program_assignments_active_window_check
    CHECK (active_to IS NULL OR active_from IS NULL OR active_to > active_from)
);

CREATE INDEX IF NOT EXISTS idx_program_assignments_person_status
  ON public.program_assignments (person_id, status);

CREATE INDEX IF NOT EXISTS idx_program_assignments_person_slug_status
  ON public.program_assignments (person_id, program_slug, status);

CREATE INDEX IF NOT EXISTS idx_program_assignments_slug_priority
  ON public.program_assignments (program_slug, priority DESC);

COMMENT ON TABLE public.program_assignments IS
  'Runtime assignment of a program to a person. Phase 8: gates inheritance of program_plan_guidance into Plans generation.';

COMMENT ON COLUMN public.program_assignments.acquisition_source IS
  'Where this assignment originated: offer | purchase | admin_grant | bundle | other.';

COMMENT ON COLUMN public.program_assignments.status IS
  'Runtime state: active | inactive | scheduled | completed | cancelled. Only active+in-window rows contribute inheritance.';

COMMENT ON COLUMN public.program_assignments.priority IS
  'Merge-priority hint. Higher = stronger preference when multiple assignments overlap.';

COMMENT ON COLUMN public.program_assignments.source_ref IS
  'Provenance pointer (offer_key, stripe subscription id, etc.). Free-form for V1.';

COMMENT ON COLUMN public.program_assignments.created_by_user_id IS
  'auth.users.id of the staff/user who created the assignment.';

-- updated_at trigger reuses the existing helper from createJournalTables.sql.
DROP TRIGGER IF EXISTS program_assignments_updated_at
  ON public.program_assignments;
CREATE TRIGGER program_assignments_updated_at
  BEFORE UPDATE ON public.program_assignments
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- RLS: service-role writes; user SELECT own via people.auth_user_id.
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own program_assignments"
  ON public.program_assignments
  FOR SELECT
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

GRANT SELECT ON public.program_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_assignments TO service_role;

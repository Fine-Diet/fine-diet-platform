-- Baseline candidate: enrollment/version/day-scoped free-text observations and
-- server-authoritative day completion. This migration is additive and is not
-- applied by the candidate importer or this worktree.

CREATE UNIQUE INDEX IF NOT EXISTS program_enrollments_id_version_unique
  ON public.program_enrollments (id, program_version_id);

CREATE TABLE public.program_day_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL,
  program_version_id UUID NOT NULL,
  program_day INTEGER NOT NULL CHECK (program_day >= 0),
  content_key TEXT NOT NULL CHECK (content_key ~ '^[a-z0-9][-a-z0-9_]{0,119}$'),
  draft_text TEXT NOT NULL DEFAULT '' CHECK (char_length(draft_text) <= 20000),
  response_text TEXT CHECK (response_text IS NULL OR char_length(response_text) <= 20000),
  saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT program_day_observations_enrollment_version_fk
    FOREIGN KEY (enrollment_id, program_version_id)
    REFERENCES public.program_enrollments (id, program_version_id) ON DELETE CASCADE,
  CONSTRAINT program_day_observations_identity_unique
    UNIQUE (enrollment_id, program_version_id, program_day, content_key),
  CONSTRAINT program_day_observations_saved_consistent
    CHECK ((response_text IS NULL AND saved_at IS NULL) OR (response_text IS NOT NULL AND saved_at IS NOT NULL))
);

CREATE INDEX program_day_observations_enrollment_day_idx
  ON public.program_day_observations (enrollment_id, program_version_id, program_day);

CREATE TABLE public.program_day_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL,
  program_version_id UUID NOT NULL,
  program_day INTEGER NOT NULL CHECK (program_day >= 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT program_day_completions_enrollment_version_fk
    FOREIGN KEY (enrollment_id, program_version_id)
    REFERENCES public.program_enrollments (id, program_version_id) ON DELETE CASCADE,
  CONSTRAINT program_day_completions_identity_unique
    UNIQUE (enrollment_id, program_version_id, program_day)
);

ALTER TABLE public.program_day_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_day_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own program day observations"
  ON public.program_day_observations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.program_enrollments e
    WHERE e.id = program_day_observations.enrollment_id
      AND e.program_version_id = program_day_observations.program_version_id
      AND e.person_id IN (SELECT programs_private.current_person_ids())
  ));

CREATE POLICY "Users can read own program day completions"
  ON public.program_day_completions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.program_enrollments e
    WHERE e.id = program_day_completions.enrollment_id
      AND e.program_version_id = program_day_completions.program_version_id
      AND e.person_id IN (SELECT programs_private.current_person_ids())
  ));

CREATE POLICY "Service role can administer program day observations"
  ON public.program_day_observations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role can administer program day completions"
  ON public.program_day_completions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.program_day_observations, public.program_day_completions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_day_observations, public.program_day_completions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_day_observations, public.program_day_completions TO service_role;

DROP TRIGGER IF EXISTS program_day_observations_updated_at ON public.program_day_observations;
CREATE TRIGGER program_day_observations_updated_at
  BEFORE UPDATE ON public.program_day_observations
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

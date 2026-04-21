-- ============================================================================
-- Plans Phase 13 (Program progress and resume state) — additive schema
--
-- Per-user progress on Packet 12 `program_content_items`, anchored to
-- `people.id` so it honors the same identity boundary as journal/plan
-- data and is automatically removed when a content item is deleted.
--
-- Progress is user-content-journey layer only: it does NOT feed into
-- `program_plan_guidance` or any plan runtime. Plans and Journal behavior
-- remain unchanged.
--
-- RLS mirrors Packet 11/12 conventions: users can read/write their own
-- rows (via people.auth_user_id); service_role retains full access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_content_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  -- Denormalized slug for efficient per-program aggregation. Matches
  -- program_assignments.program_slug + programs.slug.
  program_slug TEXT NOT NULL,

  -- Authoritative pointer to the content item. Deleting an item cascades
  -- this row. The slug above stays in sync via app-layer writes.
  content_item_id UUID NOT NULL
    REFERENCES public.program_content_items(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,

  -- Optional numeric progress (0-100). V1 uses item-level booleans;
  -- this column is reserved for future richer tracking (e.g. video %).
  progress_percent INTEGER
    CHECK (progress_percent IS NULL OR (progress_percent BETWEEN 0 AND 100)),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One progress row per user/item. Upserts go through (person_id,
  -- content_item_id) so replaying state updates is idempotent.
  CONSTRAINT program_content_progress_person_item_unique
    UNIQUE (person_id, content_item_id)
);

COMMENT ON TABLE public.program_content_progress IS
  'Phase 13: per-user progress on Packet 12 content items. Separate from program_plan_guidance.';

CREATE INDEX IF NOT EXISTS idx_program_content_progress_person_slug
  ON public.program_content_progress (person_id, program_slug);

CREATE INDEX IF NOT EXISTS idx_program_content_progress_person_status
  ON public.program_content_progress (person_id, status);

CREATE INDEX IF NOT EXISTS idx_program_content_progress_last_viewed
  ON public.program_content_progress (person_id, last_viewed_at DESC);

DROP TRIGGER IF EXISTS program_content_progress_updated_at
  ON public.program_content_progress;
CREATE TRIGGER program_content_progress_updated_at
  BEFORE UPDATE ON public.program_content_progress
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- RLS
ALTER TABLE public.program_content_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own program_content_progress"
  ON public.program_content_progress
  FOR SELECT
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can insert own program_content_progress"
  ON public.program_content_progress
  FOR INSERT
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can update own program_content_progress"
  ON public.program_content_progress
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.program_content_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.program_content_progress TO service_role;

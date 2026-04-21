-- ============================================================================
-- Plans Phase 14 (Missing-item request queue and conservative no-match
-- handling) — additive schema
--
-- When Journal search or the Packet 6 ingredient matcher can't confidently
-- resolve a trusted food object, the runtime falls back to a conservative
-- low-confidence estimate AND enqueues a row here for later ops review.
--
-- This is strictly a backlog/review layer:
--   - reads are admin-only (no public API).
--   - writes come from server services only (service_role), never from
--     the client. RLS is permissive for service_role and closed to
--     authenticated roles.
--   - dedupe is app-layer + a partial unique index on the open subset.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.missing_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Null for anonymous/server-side contexts (e.g. bulk import where we
  -- didn't carry person_id through). SET NULL on delete so a person
  -- removal never loses the backlog signal, which is useful to ops.
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,

  context TEXT NOT NULL CHECK (context IN (
    'journal_search',
    'recipe_import',
    'manual_meal_entry',
    'other'
  )),
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'journal',
    'import',
    'search',
    'other'
  )),
  -- Free-form ref back to the originating entity (e.g. imported meal id,
  -- recipe URL, journal search session id). Never a required FK — this
  -- table must survive the referenced entity going away.
  source_ref TEXT,

  raw_input TEXT NOT NULL,
  -- Lowercased + collapsed whitespace version used for dedupe.
  normalized_input TEXT NOT NULL,

  suggested_category TEXT,

  -- Arbitrary payload describing the conservative fallback that was
  -- used at runtime (e.g. { match_status: 'guessed', source_kind:
  -- 'default_guess', per_serving_contribution: {...} }). Kept as JSONB
  -- so the matcher can drop its existing structs in without shaping.
  fallback_metadata JSONB,

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'resolved', 'dismissed'
  )),

  -- When `status = 'resolved'`, optional link back to the trusted food
  -- object that the request was resolved into. SET NULL so if the food
  -- object is later deleted we keep the provenance text but break the
  -- link gracefully.
  resolved_food_object_id UUID
    REFERENCES public.food_objects(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,

  notes TEXT,

  -- Dedupe counter: every time the same (context, person_id,
  -- normalized_input) is seen again while the row is still 'open', we
  -- increment this and bump last_seen_at rather than inserting a new
  -- row. Resolving / dismissing closes the row; a later occurrence
  -- opens a fresh one.
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.missing_item_requests IS
  'Phase 14: backlog of no-match / low-confidence food item requests from Journal search and Imports, for later trusted resolution.';

-- Admin list views filter heavily by status; indexes for the common
-- dashboards.
CREATE INDEX IF NOT EXISTS idx_missing_item_requests_status_last_seen
  ON public.missing_item_requests (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_missing_item_requests_context_status
  ON public.missing_item_requests (context, status);

CREATE INDEX IF NOT EXISTS idx_missing_item_requests_person
  ON public.missing_item_requests (person_id)
  WHERE person_id IS NOT NULL;

-- Dedupe index: at most one 'open' request per (context,
-- person_id-or-null, normalized_input). Using COALESCE to fold NULL
-- person_id into the unique key so anonymous server-side imports also
-- dedupe. The sentinel UUID never appears as a real person_id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_missing_item_requests_open_dedupe
  ON public.missing_item_requests (
    context,
    COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_input
  )
  WHERE status = 'open';

DROP TRIGGER IF EXISTS missing_item_requests_updated_at
  ON public.missing_item_requests;
CREATE TRIGGER missing_item_requests_updated_at
  BEFORE UPDATE ON public.missing_item_requests
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- RLS: admin-only reads via service_role. Authenticated roles have no
-- policy (default deny). Writes always come from server services.
ALTER TABLE public.missing_item_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.missing_item_requests TO service_role;

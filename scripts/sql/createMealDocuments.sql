-- ============================================================================
-- Meal Object Foundation — Packet 2: meal_documents (Meal Library storage)
--
-- WHY THIS EXISTS
--   Establishes the person-scoped storage home for the canonical MealDocument
--   contract introduced in Packet 1 (lib/meals/types.ts). A "recipe" and a
--   reusable "meal" are the SAME document type differentiated by `kind`; this
--   table is the single home for both (recipes are a filter, not a silo — see
--   docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md §3.2).
--
-- DESIGN STANCE (versioned-JSONB-first)
--   - The full canonical MealDocument JSON lives in `document_json` and is
--     stamped with `schema_version`. The remaining columns are denormalized
--     search/filter projections of fields inside document_json so the Meal
--     Library can list and filter efficiently without parsing JSON per row.
--   - NDS is intentionally NOT required. Saved/manual meals may carry no NDS
--     (it lives inside document_json.nds when present). No NDS columns here.
--   - Ownership is enforced through person_id + RLS, mirroring journal_entries
--     and the Plans lane (createPlansTables.sql).
--
-- SAFETY
--   - Additive: creates one new table + indexes + policies + trigger.
--   - No existing table is touched. No data is migrated. journal_meal_templates
--     (Saved Meals) is left as-is; backfill into meal_documents is deferred.
--   - No runtime code writes to this table in Packet 2.
--
-- Run in Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: meal_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  -- Versioned-JSONB stamp. Matches MEAL_SCHEMA_VERSION in lib/meals/types.ts.
  schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),

  -- 'recipe' = has prep steps / yield; 'meal' = assembled set of components.
  kind TEXT NOT NULL
    CHECK (kind IN ('recipe', 'meal')),

  -- Denormalized search/filter projections of document_json.
  title TEXT NOT NULL,
  description TEXT,

  -- Review lifecycle. Mirrors MealReviewState in lib/meals/types.ts.
  review_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_state IN ('draft', 'needs_review', 'confirmed')),

  -- Intent/category tags for Meal Library filtering (MealDocumentIntent[]).
  intents TEXT[] NOT NULL DEFAULT '{}',

  -- Source / provenance (mirrors MealSource). source_type is left permissive
  -- text on purpose: the canonical MealSourceType union evolves and the
  -- authoritative copy lives in document_json.source. source_id is the generic
  -- provenance pointer (imported_meal_id / template_id / planned_meal_id).
  source_type TEXT,
  source_id TEXT,
  source_url TEXT,

  -- The full canonical MealDocument JSON (source of truth for the row).
  document_json JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Indexes
--   Ownership-scoped list + filter read paths for the Meal Library.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meal_documents_person_updated
  ON public.meal_documents (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meal_documents_person_kind_updated
  ON public.meal_documents (person_id, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meal_documents_person_review_updated
  ON public.meal_documents (person_id, review_state, updated_at DESC);

-- Title search (consistent with food_objects to_tsvector GIN pattern).
CREATE INDEX IF NOT EXISTS idx_meal_documents_title_fts
  ON public.meal_documents USING gin (to_tsvector('english', title));

-- Containment/key queries over the canonical JSON (future search modes).
CREATE INDEX IF NOT EXISTS idx_meal_documents_document_json_gin
  ON public.meal_documents USING gin (document_json jsonb_path_ops);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   Policies mirror journal_entries / Plans lane: service-role writes bypass
--   RLS; direct client access is gated on people.auth_user_id = auth.uid().
-- ----------------------------------------------------------------------------
ALTER TABLE public.meal_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_documents'
      AND policyname = 'Users can read own meal_documents'
  ) THEN
    CREATE POLICY "Users can read own meal_documents" ON public.meal_documents
      FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_documents'
      AND policyname = 'Users can insert own meal_documents'
  ) THEN
    CREATE POLICY "Users can insert own meal_documents" ON public.meal_documents
      FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_documents'
      AND policyname = 'Users can update own meal_documents'
  ) THEN
    CREATE POLICY "Users can update own meal_documents" ON public.meal_documents
      FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_documents'
      AND policyname = 'Users can delete own meal_documents'
  ) THEN
    CREATE POLICY "Users can delete own meal_documents" ON public.meal_documents
      FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger — reuse update_journal_updated_at() from
-- scripts/createJournalTables.sql.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS meal_documents_updated_at ON public.meal_documents;
CREATE TRIGGER meal_documents_updated_at BEFORE UPDATE ON public.meal_documents
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.meal_documents IS
  'Person-scoped Meal Library. Canonical MealDocument JSON in document_json (versioned by schema_version). Recipes and meals share this table via kind. NDS is optional (in document_json), never required.';
COMMENT ON COLUMN public.meal_documents.schema_version IS
  'Versioned-JSONB stamp for document_json. Matches MEAL_SCHEMA_VERSION in lib/meals/types.ts.';
COMMENT ON COLUMN public.meal_documents.kind IS
  'recipe (prep steps/yield) or meal (assembled set). Recipes are a filter, not a separate silo.';
COMMENT ON COLUMN public.meal_documents.review_state IS
  'draft | needs_review | confirmed. Mirrors MealReviewState. confirmed = accepted into the Meal Library.';
COMMENT ON COLUMN public.meal_documents.intents IS
  'Denormalized MealDocumentIntent[] for filtering. Authoritative copy lives in document_json.intents.';
COMMENT ON COLUMN public.meal_documents.source_type IS
  'Denormalized MealSource.source_type. Permissive text; authoritative copy in document_json.source.';
COMMENT ON COLUMN public.meal_documents.source_id IS
  'Generic provenance pointer (imported_meal_id / template_id / planned_meal_id). Authoritative copy in document_json.source.';
COMMENT ON COLUMN public.meal_documents.document_json IS
  'The full canonical MealDocument JSON (lib/meals/types.ts MealDocument). Source of truth for this row; other columns are search/filter projections.';

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public' AND table_name='meal_documents';
--   SELECT policyname FROM pg_policies
--    WHERE schemaname='public' AND tablename='meal_documents' ORDER BY policyname;
-- ----------------------------------------------------------------------------

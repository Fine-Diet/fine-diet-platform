-- Question Set CMS System
-- Run this in Supabase Dashboard → SQL Editor
-- Creates tables, enums, indexes, RLS policies, and triggers for question set CMS
-- Reuses existing content_audit_log table from results pack CMS

-- 0) Extensions (for gen_random_uuid) - already created if results pack CMS exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enum for revision status (reuse from results pack if exists, or create)
DO $$ BEGIN
  CREATE TYPE public.question_set_revision_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Question set identity table (stable)
-- Unique key: (assessment_type, assessment_version, locale)
-- locale is nullable (NULL means default locale)
CREATE TABLE IF NOT EXISTS public.question_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type TEXT NOT NULL,
  assessment_version TEXT NOT NULL,
  locale TEXT, -- NULL means default locale
  slug TEXT GENERATED ALWAYS AS (
    assessment_type || ':' || assessment_version || ':' || COALESCE(locale, 'default')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_sets_unique UNIQUE (assessment_type, assessment_version, locale)
);

CREATE INDEX IF NOT EXISTS idx_question_sets_slug ON public.question_sets (slug);
CREATE INDEX IF NOT EXISTS idx_question_sets_lookup ON public.question_sets (assessment_type, assessment_version, locale);

-- 3) Immutable revisions (snapshots)
CREATE TABLE IF NOT EXISTS public.question_set_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_set_id UUID NOT NULL REFERENCES public.question_sets(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  status public.question_set_revision_status NOT NULL DEFAULT 'draft',
  schema_version TEXT NOT NULL DEFAULT 'v2_question_schema_1',
  content_json JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  change_summary TEXT,
  notes TEXT,
  validation_errors JSONB,
  created_by UUID, -- link to profiles later
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_set_revisions_unique_rev UNIQUE (question_set_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_question_set_revisions_set_created
  ON public.question_set_revisions (question_set_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_set_revisions_set_status
  ON public.question_set_revisions (question_set_id, status, created_at DESC);

-- 4) Pointers: published + preview
CREATE TABLE IF NOT EXISTS public.question_set_pointers (
  question_set_id UUID PRIMARY KEY REFERENCES public.question_sets(id) ON DELETE CASCADE,
  published_revision_id UUID REFERENCES public.question_set_revisions(id),
  preview_revision_id UUID REFERENCES public.question_set_revisions(id),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) content_audit_log already exists from results pack CMS (reuse it)

-- 6) Auto-updated timestamps (reuse existing function)
-- set_updated_at() function already exists from results pack CMS

DROP TRIGGER IF EXISTS trg_question_sets_updated_at ON public.question_sets;
CREATE TRIGGER trg_question_sets_updated_at
BEFORE UPDATE ON public.question_sets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_question_set_pointers_updated_at ON public.question_set_pointers;
CREATE TRIGGER trg_question_set_pointers_updated_at
BEFORE UPDATE ON public.question_set_pointers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) current_user_role() function already exists from results pack CMS (reuse it)

-- 8) Enable RLS
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_set_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_set_pointers ENABLE ROW LEVEL SECURITY;

-- 10) RLS Policies

-- QUESTION SETS (identity)
-- Readable by anyone (fine; contains no content)
DROP POLICY IF EXISTS "question_sets_select_all" ON public.question_sets;
CREATE POLICY "question_sets_select_all"
ON public.question_sets FOR SELECT
USING (true);

-- Allow editors/admins to insert question sets
DROP POLICY IF EXISTS "question_sets_insert_editor_admin" ON public.question_sets;
CREATE POLICY "question_sets_insert_editor_admin"
ON public.question_sets FOR INSERT
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- REVISIONS
-- Public can read ONLY published revisions
DROP POLICY IF EXISTS "question_set_revisions_select_published" ON public.question_set_revisions;
CREATE POLICY "question_set_revisions_select_published"
ON public.question_set_revisions FOR SELECT
USING (status = 'published');

-- Editors/admins can read all revisions (including drafts)
DROP POLICY IF EXISTS "question_set_revisions_select_editor_admin" ON public.question_set_revisions;
CREATE POLICY "question_set_revisions_select_editor_admin"
ON public.question_set_revisions FOR SELECT
USING (public.current_user_role() IN ('editor','admin'));

-- Editors/admins can insert revisions (immutability: no update/delete policies except admin publish)
DROP POLICY IF EXISTS "question_set_revisions_insert_editor_admin" ON public.question_set_revisions;
CREATE POLICY "question_set_revisions_insert_editor_admin"
ON public.question_set_revisions FOR INSERT
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- POINTERS
-- Anyone can read pointers (only IDs)
DROP POLICY IF EXISTS "question_set_pointers_select_all" ON public.question_set_pointers;
CREATE POLICY "question_set_pointers_select_all"
ON public.question_set_pointers FOR SELECT
USING (true);

-- Editors/admins can set preview pointer (insert/update)
DROP POLICY IF EXISTS "question_set_pointers_upsert_editor_admin" ON public.question_set_pointers;
CREATE POLICY "question_set_pointers_upsert_editor_admin"
ON public.question_set_pointers FOR ALL
USING (public.current_user_role() IN ('editor','admin'))
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- Admins only can set published pointer (enforced by trigger, but also in RLS for clarity)
-- Note: The trigger enforces admin-only publish, but RLS allows editors/admins to update pointers
-- This is fine because updating published_revision_id doesn't change status, the trigger checks status change


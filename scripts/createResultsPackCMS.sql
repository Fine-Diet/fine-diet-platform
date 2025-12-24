-- Results Pack CMS System
-- Run this in Supabase Dashboard → SQL Editor
-- Creates tables, enums, indexes, RLS policies, and triggers for results pack CMS

-- 0) Extensions (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enum for revision status
DO $$ BEGIN
  CREATE TYPE public.results_pack_revision_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Pack identity table (stable)
CREATE TABLE IF NOT EXISTS public.results_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type TEXT NOT NULL,
  results_version TEXT NOT NULL,
  level_id TEXT NOT NULL, -- 'level1'..'level4'
  slug TEXT GENERATED ALWAYS AS (assessment_type || ':' || results_version || ':' || level_id) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT results_packs_unique UNIQUE (assessment_type, results_version, level_id)
);

CREATE INDEX IF NOT EXISTS idx_results_packs_slug ON public.results_packs (slug);

-- 3) Immutable revisions (snapshots)
CREATE TABLE IF NOT EXISTS public.results_pack_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.results_packs(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  status public.results_pack_revision_status NOT NULL DEFAULT 'draft',
  schema_version TEXT NOT NULL DEFAULT 'v2_pack_schema_1',
  content_json JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  change_summary TEXT,
  validation_errors JSONB,
  created_by UUID, -- link to profiles later
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT results_pack_revisions_unique_rev UNIQUE (pack_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_results_pack_revisions_pack_created
  ON public.results_pack_revisions (pack_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_results_pack_revisions_pack_status
  ON public.results_pack_revisions (pack_id, status, created_at DESC);

-- 4) Pointers: published + preview
CREATE TABLE IF NOT EXISTS public.results_pack_pointers (
  pack_id UUID PRIMARY KEY REFERENCES public.results_packs(id) ON DELETE CASCADE,
  published_revision_id UUID REFERENCES public.results_pack_revisions(id),
  preview_revision_id UUID REFERENCES public.results_pack_revisions(id),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Optional audit log (recommended)
CREATE TABLE IF NOT EXISTS public.content_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_audit_log_entity ON public.content_audit_log(entity_type, entity_id, created_at DESC);

-- 6) Auto-updated timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_results_packs_updated_at ON public.results_packs;
CREATE TRIGGER trg_results_packs_updated_at
BEFORE UPDATE ON public.results_packs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_results_pack_pointers_updated_at ON public.results_pack_pointers;
CREATE TRIGGER trg_results_pack_pointers_updated_at
BEFORE UPDATE ON public.results_pack_pointers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Helper: current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'user');
$$;

-- 8) Enable RLS
ALTER TABLE public.results_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results_pack_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results_pack_pointers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_audit_log ENABLE ROW LEVEL SECURITY;

-- 9) RLS Policies

-- RESULTS PACKS (identity)
-- Readable by anyone (fine; contains no copy)
DROP POLICY IF EXISTS "results_packs_select_all" ON public.results_packs;
CREATE POLICY "results_packs_select_all"
ON public.results_packs FOR SELECT
USING (true);

-- Allow editors/admins to insert packs
DROP POLICY IF EXISTS "results_packs_insert_editor_admin" ON public.results_packs;
CREATE POLICY "results_packs_insert_editor_admin"
ON public.results_packs FOR INSERT
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- Revisions
-- Public can read ONLY published revisions
DROP POLICY IF EXISTS "revisions_select_published" ON public.results_pack_revisions;
CREATE POLICY "revisions_select_published"
ON public.results_pack_revisions FOR SELECT
USING (status = 'published');

-- Editors/admins can read all revisions
DROP POLICY IF EXISTS "revisions_select_editor_admin" ON public.results_pack_revisions;
CREATE POLICY "revisions_select_editor_admin"
ON public.results_pack_revisions FOR SELECT
USING (public.current_user_role() IN ('editor','admin'));

-- Editors/admins can insert revisions (immutability: no update/delete policies)
DROP POLICY IF EXISTS "revisions_insert_editor_admin" ON public.results_pack_revisions;
CREATE POLICY "revisions_insert_editor_admin"
ON public.results_pack_revisions FOR INSERT
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- Pointers
-- Anyone can read pointers (only IDs)
DROP POLICY IF EXISTS "pointers_select_all" ON public.results_pack_pointers;
CREATE POLICY "pointers_select_all"
ON public.results_pack_pointers FOR SELECT
USING (true);

-- Editors/admins can set preview pointer
DROP POLICY IF EXISTS "pointers_update_preview_editor_admin" ON public.results_pack_pointers;
CREATE POLICY "pointers_update_preview_editor_admin"
ON public.results_pack_pointers FOR UPDATE
USING (public.current_user_role() IN ('editor','admin'))
WITH CHECK (public.current_user_role() IN ('editor','admin'));

-- Audit log (editors/admins can insert; only admins can read all)
DROP POLICY IF EXISTS "audit_insert_editor_admin" ON public.content_audit_log;
CREATE POLICY "audit_insert_editor_admin"
ON public.content_audit_log FOR INSERT
WITH CHECK (public.current_user_role() IN ('editor','admin'));

DROP POLICY IF EXISTS "audit_select_admin" ON public.content_audit_log;
CREATE POLICY "audit_select_admin"
ON public.content_audit_log FOR SELECT
USING (public.current_user_role() = 'admin');


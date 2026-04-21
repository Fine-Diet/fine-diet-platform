-- ============================================================================
-- Plans Phase 7 (Program guidance producer + admin flow) — additive schema
--
-- Phase 1 pre-created `program_plan_guidance` as the structured bridge
-- object consumed by Plans. Packet 7 formalizes the producer side of
-- that contract and introduces an admin authoring flow.
--
-- Producer-side additions:
--
--   program_plan_guidance.priority
--       Integer merge-priority hint for admin authored guidance.
--       Higher = stronger preference when multiple active rows exist
--       for the same person/scope. Default 0 leaves merge behavior
--       identical to Phase 1..6. The Plans consumer may ignore this
--       field today; Packet 7 only guarantees authoring/surface-level
--       support. Future merge-algorithm updates can start consuming
--       it without another schema change.
--
--   program_plan_guidance.guidance_type
--       Free-form classifier so admin staff can distinguish between
--       e.g. `program_template`, `assignment`, `person_override`,
--       `temporary`, etc. Never required for Plans resolution; used
--       in admin list/filter UI. Nullable for backfill safety.
--
--   program_plan_guidance.notes
--       Short internal admin note (non-user-facing) distinct from the
--       user-facing `notes_md` carried inside `guidance_payload_json`.
--       Helps staff track why a guidance row was authored.
--
--   program_plan_guidance.created_by_user_id
--       Tracks which staff user authored the row. Nullable because the
--       auth.users ↔ people.id mapping is resolved lazily elsewhere;
--       we intentionally do not add an FK to auth.users from this lane.
--
-- Additive only: no existing columns are dropped, renamed, or retyped.
-- RLS is unchanged — writes remain service-role only.
--
-- Run in Supabase SQL Editor.
-- ============================================================================

ALTER TABLE public.program_plan_guidance
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.program_plan_guidance
  ADD COLUMN IF NOT EXISTS guidance_type TEXT;

ALTER TABLE public.program_plan_guidance
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.program_plan_guidance
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_program_guidance_person_active_priority
  ON public.program_plan_guidance (person_id, active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_program_guidance_slug_priority
  ON public.program_plan_guidance (program_slug, priority DESC);

COMMENT ON COLUMN public.program_plan_guidance.priority IS
  'Admin-authored merge priority. Higher wins when multiple active rows conflict. Plans consumer may defer consumption.';

COMMENT ON COLUMN public.program_plan_guidance.guidance_type IS
  'Admin classifier (program_template | assignment | person_override | temporary | other). Free-form for V1.';

COMMENT ON COLUMN public.program_plan_guidance.notes IS
  'Internal staff note. Distinct from user-facing notes_md carried inside guidance_payload_json.';

COMMENT ON COLUMN public.program_plan_guidance.created_by_user_id IS
  'auth.users.id of the staff user who authored this row. Not a DB FK to avoid cross-schema coupling.';

-- ============================================================================
-- Access Code Gate v1.1: add `archived` to access_codes.status
-- Run this in Supabase Dashboard → SQL Editor
--
-- Extends the status CHECK on public.access_codes to include `archived`, used
-- by the Admin Access Codes Manager (/admin/access-codes) to archive a code
-- without deleting it. Archived codes are not offered in the Access Code Gate
-- module builder selector and do not verify.
--
-- Additive only: no columns are added or removed; only the CHECK constraint is
-- replaced. Existing rows remain valid.
--
-- Prerequisite:
--   - public.access_codes exists (created by createAccessCodeGateV1.sql)
-- ============================================================================

-- Drop and recreate the status CHECK to include 'archived'.
-- The original constraint name is `access_codes_status_check` (Postgres auto-
-- named from the column CHECK in createAccessCodeGateV1.sql).
ALTER TABLE public.access_codes
  DROP CONSTRAINT IF EXISTS access_codes_status_check;

ALTER TABLE public.access_codes
  ADD CONSTRAINT access_codes_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'expired', 'archived'));

-- Verification Queries (run after migration to confirm)
-- SELECT con.conname, pg_get_constraintdef(con.oid)
--   FROM pg_constraint con
--   JOIN pg_class rel ON rel.oid = con.conrelid
--   JOIN pg_namespace nsp ON nsp.oid = connamespace
--   WHERE nsp.nspname = 'public' AND rel.relname = 'access_codes'
--     AND con.contype = 'c';

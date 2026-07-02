-- ============================================================================
-- Access Code Gate v1: access_codes + access_code_redemptions
-- Run this in Supabase Dashboard → SQL Editor
--
-- Creates: public.access_codes, public.access_code_redemptions
-- Used by: POST /api/access-codes/verify (access.code-gate.v1 module)
--
-- Prerequisites:
--   - public.people table exists (FK target for redemptions)
--   - public.set_updated_at() trigger function exists (from createResultsPackCMS.sql)
--
-- Hard rules:
--   - Additive only: no existing tables are modified.
--   - Plaintext codes are NEVER stored. `code_key` is a non-secret human label
--     only (may be null); the secret is `code_hash` (HMAC-SHA-256 of the
--     normalized code using ACCESS_CODE_HASH_SECRET, computed in app code).
--   - RLS deny-by-default: every table has ENABLE ROW LEVEL SECURITY.
--   - Service role can always manage all (API routes use supabaseAdmin).
--   - No plaintext seed codes are inserted by this script.
-- ============================================================================


-- ============================================================================
-- A) access_codes
-- The registry of redeemable access codes. Stored as a hash, never plaintext.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Non-secret human label for admin identification (may be null). NOT the code.
  code_key TEXT UNIQUE,
  -- HMAC-SHA-256(normalize(code), ACCESS_CODE_HASH_SECRET). The secret used for
  -- verification and for any future code-generation tooling. Unique.
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'expired')),
  scope TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'start_page', 'program', 'integrative_care', 'offer')),
  -- Scope constraints. A NULL field is a wildcard for that dimension.
  start_page_slug TEXT,
  program_slug TEXT,
  product_slug TEXT,
  offer_key TEXT,
  max_redemptions INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- redemption_count cannot exceed max_redemptions when a limit is set.
  CONSTRAINT access_codes_redemption_limit_check
    CHECK (max_redemptions IS NULL OR redemption_count <= max_redemptions),
  -- Expiry, when set, must be after valid_from (when valid_from is also set).
  CONSTRAINT access_codes_time_window_check
    CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at > valid_from)
);

-- Lookup by hash (the verification path).
CREATE INDEX IF NOT EXISTS idx_access_codes_hash
  ON public.access_codes (code_hash);
-- Admin filtering by status/scope.
CREATE INDEX IF NOT EXISTS idx_access_codes_status_scope
  ON public.access_codes (status, scope);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_access_codes_updated_at ON public.access_codes;
CREATE TRIGGER trg_access_codes_updated_at
  BEFORE UPDATE ON public.access_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (API routes use supabaseAdmin)
DROP POLICY IF EXISTS "Service role can manage access_codes" ON public.access_codes;
CREATE POLICY "Service role can manage access_codes"
  ON public.access_codes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: admin/editor can read/manage codes (future admin UI)
DROP POLICY IF EXISTS "Admin/editor can manage access_codes" ON public.access_codes;
CREATE POLICY "Admin/editor can manage access_codes"
  ON public.access_codes FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.access_codes IS 'Redeemable access codes for access.code-gate.v1. Stored as HMAC hashes; plaintext codes are never stored.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_codes TO authenticated;


-- ============================================================================
-- B) access_code_redemptions
-- Append-only audit trail of successful redemptions. person_id is linked only
-- when the submitted email already matches an existing person; people rows are
-- never created silently by the verification endpoint.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id UUID NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  email TEXT,
  source TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup: redemptions for a code (admin reporting).
CREATE INDEX IF NOT EXISTS idx_access_code_redemptions_code
  ON public.access_code_redemptions (access_code_id, redeemed_at DESC);
-- Lookup: redemptions by person.
CREATE INDEX IF NOT EXISTS idx_access_code_redemptions_person
  ON public.access_code_redemptions (person_id, redeemed_at DESC)
  WHERE person_id IS NOT NULL;

-- Enable RLS (deny-by-default)
ALTER TABLE public.access_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (API routes use supabaseAdmin)
DROP POLICY IF EXISTS "Service role can manage access_code_redemptions" ON public.access_code_redemptions;
CREATE POLICY "Service role can manage access_code_redemptions"
  ON public.access_code_redemptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: admin/editor can read redemptions (future admin UI)
DROP POLICY IF EXISTS "Admin/editor can read access_code_redemptions" ON public.access_code_redemptions;
CREATE POLICY "Admin/editor can read access_code_redemptions"
  ON public.access_code_redemptions
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.access_code_redemptions IS 'Append-only audit trail of successful access-code redemptions. person_id is linked only when the email already matched a person; no silent people creation.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_code_redemptions TO service_role;
GRANT SELECT ON public.access_code_redemptions TO authenticated;


-- ============================================================================
-- Verification Queries (run after migration to confirm)
-- ============================================================================

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('access_codes', 'access_code_redemptions');

-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('access_codes', 'access_code_redemptions');

-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('access_codes', 'access_code_redemptions')
-- ORDER BY tablename, policyname;

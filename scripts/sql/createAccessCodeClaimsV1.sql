-- ============================================================================
-- Access Code Gate v1 — Phase 2: access_code_claims
-- Run this in Supabase Dashboard → SQL Editor
--
-- Creates: public.access_code_claims
-- Used by:
--   - POST /api/access-codes/verify  (creates a pending claim for offer-attached codes)
--   - POST /api/access-codes/claim   (authenticated grant: resolves person + grants)
--
-- Prerequisites:
--   - public.access_codes exists (createAccessCodeGateV1.sql)
--   - public.access_code_redemptions exists (createAccessCodeGateV1.sql)
--   - public.people exists (FK target, set null on delete)
--   - public.set_updated_at() trigger function exists
--
-- Hard rules:
--   - Additive only: no existing tables are modified.
--   - Raw claim tokens are NEVER stored. The stored secret is
--     `claim_token_hash` = HMAC-SHA-256('access-code-claim:' || token,
--     ACCESS_CODE_HASH_SECRET), computed in app code.
--   - The raw claim token is returned to the client exactly once (at verify
--     time) and is a bearer credential — NOT the access code. It is never
--     put in URLs by the server.
--   - RLS deny-by-default. Only the service role (API routes via
--     supabaseAdmin) can insert/update. Admin/editor may read for reporting.
--   - No plaintext access codes or raw claim tokens are stored here.
-- ============================================================================


CREATE TABLE IF NOT EXISTS public.access_code_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id UUID NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  redemption_id UUID REFERENCES public.access_code_redemptions(id) ON DELETE SET NULL,
  -- HMAC-SHA-256 of the raw claim token. Unique. The raw token is never stored.
  claim_token_hash TEXT NOT NULL UNIQUE,
  offer_key TEXT NOT NULL,
  email TEXT,
  redirect_path TEXT,
  source TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'granted', 'expired', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  grant_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  grant_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Expiry must be in the future at write time (creates/updates enforce this
  -- for the lifecycle columns; the trigger keeps updated_at fresh).
  CONSTRAINT access_code_claims_expires_at_check
    CHECK (expires_at IS NOT NULL)
);

-- Lookup by claim token hash (the authenticated grant path).
CREATE INDEX IF NOT EXISTS idx_access_code_claims_token_hash
  ON public.access_code_claims (claim_token_hash);
-- Lookup: claims for a code (admin reporting / audit).
CREATE INDEX IF NOT EXISTS idx_access_code_claims_access_code
  ON public.access_code_claims (access_code_id, created_at DESC);
-- Expiry sweep: find pending/claimed claims past their expiry.
CREATE INDEX IF NOT EXISTS idx_access_code_claims_status_expires
  ON public.access_code_claims (status, expires_at)
  WHERE status IN ('pending', 'claimed');

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_access_code_claims_updated_at ON public.access_code_claims;
CREATE TRIGGER trg_access_code_claims_updated_at
  BEFORE UPDATE ON public.access_code_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.access_code_claims ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (API routes use supabaseAdmin)
DROP POLICY IF EXISTS "Service role can manage access_code_claims" ON public.access_code_claims;
CREATE POLICY "Service role can manage access_code_claims"
  ON public.access_code_claims FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: admin/editor can read claims (audit/reporting). No public read.
DROP POLICY IF EXISTS "Admin/editor can read access_code_claims" ON public.access_code_claims;
CREATE POLICY "Admin/editor can read access_code_claims"
  ON public.access_code_claims
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.access_code_claims IS 'Short-lived access-code claim/intent for offer-attached codes. Holds a hashed bearer token; the raw token is never stored. Entitlements are granted only after an authenticated, known person claims it.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_code_claims TO service_role;
GRANT SELECT ON public.access_code_claims TO authenticated;


-- ============================================================================
-- Verification Queries (run after migration to confirm)
-- ============================================================================

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name = 'access_code_claims';

-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'access_code_claims';

-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'access_code_claims'
-- ORDER BY policyname;

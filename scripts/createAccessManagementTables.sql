-- ============================================================================
-- Access Management v1: Entitlements, Access Links, Offers
-- Run this in Supabase Dashboard → SQL Editor
--
-- Creates: person_entitlements, person_access_links, offers, offer_entitlements
-- Used by: journal access gating (replaces/extends subscriptions), staff "view as client", offers/bundles
--
-- Prerequisites:
--   - public.people table exists
--   - public.profiles table exists (with role CHECK including staff, coach)
--   - public.current_user_role() function exists (from createResultsPackCMS.sql)
--   - public.set_updated_at() trigger function exists (from createResultsPackCMS.sql)
--
-- Hard rules:
--   - Additive only: no existing tables are modified
--   - RLS deny-by-default: every table has ENABLE ROW LEVEL SECURITY
--   - Service role can always manage all (for API routes that use supabaseAdmin)
-- ============================================================================


-- ============================================================================
-- A) person_entitlements
-- What a person is entitled to (e.g. 'journal', 'program:xyz')
-- Replaces/extends the subscription-based gating for journal access.
-- The existing subscriptions table is NOT modified; a compat shim will
-- check subscriptions first, then person_entitlements.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.person_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,              -- e.g. 'journal', 'program:gut-check-premium'
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,                        -- NULL = no expiry
  source TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'offer' | 'stripe' | 'admin_grant' | 'migration'
  source_ref TEXT,                            -- e.g. offer_key, stripe subscription id, etc.
  note TEXT,                                  -- free-text admin note
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Time window sanity: if ends_at is set it must be after starts_at
  CONSTRAINT person_entitlements_time_window_check
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- Primary lookup: "does person X have entitlement Y active?"
CREATE INDEX IF NOT EXISTS idx_person_entitlements_lookup
  ON public.person_entitlements (person_id, entitlement_key, is_active);

-- Expiry index: find entitlements that need deactivation
CREATE INDEX IF NOT EXISTS idx_person_entitlements_ends_at
  ON public.person_entitlements (ends_at)
  WHERE ends_at IS NOT NULL AND is_active = true;

-- Dedupe guard: at most one active, non-expiring row per (person, key)
-- This prevents accidentally granting the same perpetual entitlement twice.
-- Time-limited entitlements (ends_at IS NOT NULL) are excluded so stacking is possible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_entitlements_active_unique
  ON public.person_entitlements (person_id, entitlement_key)
  WHERE is_active = true AND ends_at IS NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_person_entitlements_updated_at ON public.person_entitlements;
CREATE TRIGGER trg_person_entitlements_updated_at
  BEFORE UPDATE ON public.person_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.person_entitlements ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (API routes use supabaseAdmin)
CREATE POLICY "Service role can manage person_entitlements"
  ON public.person_entitlements FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: user can read their own entitlements
CREATE POLICY "Users can read own entitlements"
  ON public.person_entitlements
  FOR SELECT
  TO authenticated
  USING (
    person_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: admin/editor can read all entitlements
CREATE POLICY "Admin/editor can read all entitlements"
  ON public.person_entitlements
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can insert entitlements
CREATE POLICY "Admin/editor can insert entitlements"
  ON public.person_entitlements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can update entitlements
CREATE POLICY "Admin/editor can update entitlements"
  ON public.person_entitlements
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can delete entitlements
CREATE POLICY "Admin/editor can delete entitlements"
  ON public.person_entitlements
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.person_entitlements IS 'What a person is entitled to access. Checked alongside subscriptions for journal gating (compat shim).';

-- Grants
GRANT SELECT ON public.person_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_entitlements TO service_role;


-- ============================================================================
-- B) person_access_links
-- Who can view/act on whose data (e.g. staff viewing a client's journal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.person_access_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  granter_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  grantee_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  scope TEXT NOT NULL
    CHECK (scope IN ('journal_read', 'journal_write', 'client_admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,                        -- NULL = no expiry
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Time window sanity
  CONSTRAINT person_access_links_time_window_check
    CHECK (ends_at IS NULL OR ends_at > starts_at),

  -- Cannot grant access to yourself
  CONSTRAINT person_access_links_no_self_grant
    CHECK (granter_person_id != grantee_person_id)
);

-- Primary lookup: "what can grantee X access?"
CREATE INDEX IF NOT EXISTS idx_person_access_links_grantee
  ON public.person_access_links (grantee_person_id, granter_person_id, scope, is_active);

-- Reverse lookup: "who can access granter Y's data?"
CREATE INDEX IF NOT EXISTS idx_person_access_links_granter
  ON public.person_access_links (granter_person_id, is_active);

-- Dedupe: one active link per (granter, grantee, scope)
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_access_links_active_unique
  ON public.person_access_links (granter_person_id, grantee_person_id, scope)
  WHERE is_active = true;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_person_access_links_updated_at ON public.person_access_links;
CREATE TRIGGER trg_person_access_links_updated_at
  BEFORE UPDATE ON public.person_access_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.person_access_links ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access
CREATE POLICY "Service role can manage person_access_links"
  ON public.person_access_links FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: granter can see links where they are the granter ("who can access my data?")
CREATE POLICY "Granter can read own access links"
  ON public.person_access_links
  FOR SELECT
  TO authenticated
  USING (
    granter_person_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: grantee can see links where they are the grantee ("whose data can I access?")
CREATE POLICY "Grantee can read own access links"
  ON public.person_access_links
  FOR SELECT
  TO authenticated
  USING (
    grantee_person_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: admin/editor can read all access links
CREATE POLICY "Admin/editor can read all access links"
  ON public.person_access_links
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can insert access links
CREATE POLICY "Admin/editor can insert access links"
  ON public.person_access_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can update access links
CREATE POLICY "Admin/editor can update access links"
  ON public.person_access_links
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can delete access links
CREATE POLICY "Admin/editor can delete access links"
  ON public.person_access_links
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.person_access_links IS 'Relationship links: who can view/act on whose data. Scope: journal_read, journal_write, client_admin.';

-- Grants
GRANT SELECT ON public.person_access_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_access_links TO service_role;


-- ============================================================================
-- C) offers
-- Purchasable products/bundles that grant entitlements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.offers (
  offer_key TEXT PRIMARY KEY,                 -- e.g. 'journal-monthly', 'gut-check-bundle'
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  purchase_provider TEXT,                     -- e.g. 'stripe', 'manual', null
  provider_product_id TEXT,                   -- e.g. Stripe product/price ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_offers_updated_at ON public.offers;
CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access
CREATE POLICY "Service role can manage offers"
  ON public.offers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: authenticated users can read active offers (for purchase UI)
CREATE POLICY "Authenticated can read active offers"
  ON public.offers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policy: admin/editor can read all offers (including inactive)
CREATE POLICY "Admin/editor can read all offers"
  ON public.offers
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can insert offers
CREATE POLICY "Admin/editor can insert offers"
  ON public.offers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can update offers
CREATE POLICY "Admin/editor can update offers"
  ON public.offers
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can delete offers
CREATE POLICY "Admin/editor can delete offers"
  ON public.offers
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.offers IS 'Purchasable offers/bundles. Each offer grants one or more entitlements via offer_entitlements.';

-- Grants
GRANT SELECT ON public.offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO service_role;


-- ============================================================================
-- D) offer_entitlements
-- Maps an offer to the entitlement(s) it grants when purchased
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.offer_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_key TEXT NOT NULL REFERENCES public.offers(offer_key) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,              -- must match person_entitlements.entitlement_key
  duration_days INTEGER,                      -- NULL = perpetual; otherwise creates ends_at on grant
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- duration_days must be positive if set
  CONSTRAINT offer_entitlements_duration_check
    CHECK (duration_days IS NULL OR duration_days > 0)
);

-- Lookup: "what entitlements does offer X grant?"
CREATE INDEX IF NOT EXISTS idx_offer_entitlements_offer
  ON public.offer_entitlements (offer_key, is_active);

-- Reverse lookup: "which offers grant entitlement Y?"
CREATE INDEX IF NOT EXISTS idx_offer_entitlements_key
  ON public.offer_entitlements (entitlement_key);

-- Dedupe: one active mapping per (offer, entitlement_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_entitlements_active_unique
  ON public.offer_entitlements (offer_key, entitlement_key)
  WHERE is_active = true;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_offer_entitlements_updated_at ON public.offer_entitlements;
CREATE TRIGGER trg_offer_entitlements_updated_at
  BEFORE UPDATE ON public.offer_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.offer_entitlements ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access
CREATE POLICY "Service role can manage offer_entitlements"
  ON public.offer_entitlements FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: authenticated users can read active mappings (for purchase/display UI)
CREATE POLICY "Authenticated can read active offer entitlements"
  ON public.offer_entitlements
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policy: admin/editor can read all mappings
CREATE POLICY "Admin/editor can read all offer entitlements"
  ON public.offer_entitlements
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can insert mappings
CREATE POLICY "Admin/editor can insert offer entitlements"
  ON public.offer_entitlements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can update mappings
CREATE POLICY "Admin/editor can update offer entitlements"
  ON public.offer_entitlements
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Policy: admin/editor can delete mappings
CREATE POLICY "Admin/editor can delete offer entitlements"
  ON public.offer_entitlements
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'));

COMMENT ON TABLE public.offer_entitlements IS 'Maps offers to the entitlements they grant. duration_days NULL = perpetual.';

-- Grants
GRANT SELECT ON public.offer_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_entitlements TO service_role;


-- ============================================================================
-- Verification Queries (run after migration to confirm)
-- ============================================================================

-- Check all four tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('person_entitlements', 'person_access_links', 'offers', 'offer_entitlements');

-- Check RLS is enabled on all four
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('person_entitlements', 'person_access_links', 'offers', 'offer_entitlements');

-- Check policies
-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('person_entitlements', 'person_access_links', 'offers', 'offer_entitlements')
-- ORDER BY tablename, policyname;

-- Check indexes
-- SELECT indexname, tablename, indexdef FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('person_entitlements', 'person_access_links', 'offers', 'offer_entitlements')
-- ORDER BY tablename, indexname;

-- ============================================================================
-- site_content — CANONICAL TABLE DEFINITION + HARDENED RLS   *** NO-APPLY ***
--
--   Repo-only documentation/SQL. DO NOT APPLY blindly. The table already exists
--   in production; this file documents its shape + the hardened RLS posture for
--   version control and local reproduction.
--
-- WHY THIS FILE EXISTS
--   `public.site_content` is the shared CMS table behind integrative-care, SEO,
--   navigation, home, journal, programs-marketing, feature flags, products, etc.
--   It was created directly in the hosted project and originally had NO committed
--   DDL in this repo.
--
-- PROVENANCE (RECONCILED AGAINST PRODUCTION)
--   The column set, indexes, constraints, grants, and RLS posture below were
--   RECONCILED against the live production schema on 2026-06-26 via catalog-only
--   introspection (information_schema / pg_catalog / pg_policies — no row data
--   was read). This file now mirrors the real production table shape, plus the
--   hardened RLS policies applied to production by the
--   `harden_site_content_rls` migration (verbatim of
--   scripts/sql/hardenSiteContentRls.sql).
--
--   `CREATE TABLE IF NOT EXISTS` keeps it non-destructive on the existing prod
--   table: it documents the intended baseline and (re)asserts the hardened RLS
--   policies. It does NOT alter existing prod columns or grants.
--
-- HARDENED POSTURE (matches production after harden_site_content_rls):
--   * Public (anon + authenticated) may SELECT published rows only.
--   * INSERT / UPDATE / DELETE: SERVICE ROLE ONLY (enforced by RLS — no
--     anon/authenticated write policy exists).
--   * No authenticated-admin direct-write path (admin writes flow through
--     supabaseAdmin behind the admin API RBAC guard).
--   * RLS is ENABLED and FORCED.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS then
-- CREATE. Safe to re-run. Touches no row data and no offers/entitlements.
-- ============================================================================

BEGIN;

-- ── 1) Table (mirrors production column set) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_content (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical content key, e.g. 'product:programs:nutrition',
  -- 'composition:programs:nutrition', 'nav', 'home', 'seo:…'.
  key        TEXT NOT NULL,
  -- Page/record payload. Schema is enforced in the app layer (Zod), not here.
  -- (Production has no column default on data.)
  data       JSONB NOT NULL,
  -- Draft vs published. A given key has at most one row per status.
  status     TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional actor reference for the last write (nullable; no FK in prod).
  updated_by UUID,
  -- Upserts target (key, status); see integrativeCareApi onConflict: 'key,status'.
  CONSTRAINT unique_site_content_key_status UNIQUE (key, status)
);

COMMENT ON TABLE public.site_content IS
  'Shared CMS content (CMS keys x draft/published). Writes are service-role-only; public reads published rows only. Reconciled against prod 2026-06-26.';

-- NOTE: production maintains updated_at via the application (explicit write on
-- upsert), not a DB trigger. No created_at column exists in production.

-- ── 2) RLS: enable + force ───────────────────────────────────────────────────
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
-- Defense-in-depth: enforce RLS even for the table owner so a non-service owner
-- connection cannot sidestep policies. (service_role still bypasses RLS.)
-- Blast-radius note: FORCE RLS affects table-owner tooling that relies on
-- implicit owner bypass; service-role app access is unaffected.
ALTER TABLE public.site_content FORCE ROW LEVEL SECURITY;

-- ── 3) Policies (hardened posture — matches production) ──────────────────────
-- Public read of PUBLISHED rows only (anon + authenticated via `public`).
DROP POLICY IF EXISTS anon_read_published ON public.site_content;
CREATE POLICY anon_read_published
  ON public.site_content
  FOR SELECT
  TO public
  USING (status = 'published');

-- Service-role-only writes (and full access). No anon/authenticated write policy
-- exists, so INSERT/UPDATE/DELETE are denied to everyone except the service role.
DROP POLICY IF EXISTS service_role_manage_site_content ON public.site_content;
CREATE POLICY service_role_manage_site_content
  ON public.site_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Drop the legacy permissive policy if still present (already removed in prod by
-- the harden_site_content_rls migration).
DROP POLICY IF EXISTS authenticated_full_access_site_content ON public.site_content;

-- ── 4) Grants (mirrors production) ───────────────────────────────────────────
-- Production currently grants ALL privileges to anon + authenticated +
-- service_role (Supabase default). The hardened RLS above makes the
-- anon/authenticated INSERT/UPDATE/DELETE grants INERT — no write policy applies
-- to them, so writes are denied regardless of the grant. These broad grants are
-- mirrored here to match prod truthfully.
--
-- DEFERRED TIGHTENING (intentionally NOT applied yet — belt-and-suspenders):
--   REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.site_content FROM anon, authenticated;
GRANT ALL ON public.site_content TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — catalog-only; safe to run against any environment)
-- ============================================================================
-- Expected policy set (exactly 2):
--   anon_read_published              | {public}       | SELECT | (status = 'published')
--   service_role_manage_site_content | {service_role} | ALL    | true / true
--
-- SELECT policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='site_content'
-- ORDER BY policyname;
--
-- No permissive authenticated policy (expect 0):
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname='public' AND tablename='site_content'
--   AND policyname='authenticated_full_access_site_content';
--
-- No non-service write policy (expect 0):
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname='public' AND tablename='site_content'
--   AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND NOT (roles = '{service_role}');
--
-- RLS enabled + forced (expect t / t):
-- SELECT relrowsecurity, relforcerowsecurity
-- FROM pg_class WHERE oid='public.site_content'::regclass;
--
-- Production state confirmed 2026-06-26 (post harden_site_content_rls):
--   policies = {anon_read_published, service_role_manage_site_content}
--   permissive_authenticated_policies = 0; non_service_write_policies = 0
--   rls: enabled = t, forced = t
-- ============================================================================

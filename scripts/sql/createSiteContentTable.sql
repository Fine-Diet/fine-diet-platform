-- ============================================================================
-- site_content — CANONICAL TABLE DEFINITION + HARDENED RLS   *** NO-APPLY ***
--
--   Repo-only documentation/SQL. DO NOT APPLY to any database (prod or
--   non-prod) without explicit sign-off and a prod reconciliation pass.
--
-- WHY THIS FILE EXISTS
--   `public.site_content` is the shared CMS table behind integrative-care, SEO,
--   navigation, home, journal, programs-marketing, feature flags, products, etc.
--   It was created directly in the hosted project (SQL editor / MCP) and has had
--   NO committed DDL in this repo. That means its shape and RLS posture lived
--   nowhere in version control — which is exactly why scripts/sql/
--   hardenSiteContentRls.sql had to reconstruct the policy posture from
--   inspection. This file captures both the table shape and the HARDENED policy
--   posture so they are reviewable and locally reproducible.
--
-- PROVENANCE / ACCURACY CAVEAT  (IMPORTANT)
--   The column set below is RECONSTRUCTED from application usage, NOT dumped from
--   production:
--     * key / data / status        — lib/contentApi.ts, lib/integrativeCareApi.ts
--                                     (.select('data, updated_at').eq('key',…)
--                                      .eq('status',…))
--     * UNIQUE (key, status)        — upsert onConflict: 'key,status'
--                                     (lib/integrativeCareApi.ts)
--     * status CHECK ('draft','published'), updated_at
--                                     — scripts/sql/seedProgramsMarketingDraftContent.sql
--   The real prod table MAY have additional columns, defaults, indexes, or a
--   updated_at trigger this file does not capture. BEFORE any apply, dump the
--   live table (columns, constraints, indexes, triggers, policies, grants) and
--   reconcile this file against it. `CREATE TABLE IF NOT EXISTS` makes this file
--   non-destructive on an existing table: it will NOT alter or recreate prod
--   columns — it only documents the intended baseline and (re)asserts the
--   hardened RLS policies.
--
-- HARDENED POSTURE CAPTURED HERE (mirrors scripts/sql/hardenSiteContentRls.sql,
-- verified off-prod against a local Supabase Postgres 17 stack):
--   * Public (anon + authenticated) may SELECT published rows only.
--   * INSERT / UPDATE / DELETE: SERVICE ROLE ONLY.
--   * No authenticated-admin direct-write path (admin writes flow through
--     supabaseAdmin behind the admin API RBAC guard).
--   * Draft rows are readable only via the service role.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS then
-- CREATE. Safe to re-run. Changes RLS POLICIES + (additively) table shape only;
-- touches no row data and no offers/entitlements.
-- ============================================================================

BEGIN;

-- ── 1) Table (non-destructive; documents the intended baseline shape) ────────
CREATE TABLE IF NOT EXISTS public.site_content (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical content key, e.g. 'product:programs:nutrition',
  -- 'composition:programs:nutrition', 'nav', 'home', 'seo:…'.
  key        TEXT NOT NULL,
  -- Page/record payload. Schema is enforced in the app layer (Zod), not here.
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Draft vs published. A given key has at most one row per status.
  status     TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Upserts target (key, status); see integrativeCareApi onConflict: 'key,status'.
  CONSTRAINT site_content_key_status_unique UNIQUE (key, status)
);

COMMENT ON TABLE public.site_content IS
  'Shared CMS content (CMS keys x draft/published). Writes are service-role-only; public reads published rows only. Shape reconstructed in repo — reconcile against prod before apply.';

-- Fast lookups by status (e.g. list-all-published).
CREATE INDEX IF NOT EXISTS idx_site_content_status
  ON public.site_content (status);

-- NOTE: prod may maintain updated_at via a BEFORE UPDATE trigger
-- (e.g. set_updated_at() / update_journal_updated_at()). The app also sets
-- updated_at explicitly on upsert. No trigger is asserted here to avoid drift;
-- confirm against prod and add one in a reconciled migration if present.

-- ── 2) RLS: enable + force ───────────────────────────────────────────────────
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
-- Defense-in-depth: enforce RLS even for the table owner so a non-service owner
-- connection cannot sidestep policies. (service_role still bypasses RLS.)
-- Blast-radius note: FORCE RLS affects table-owner tooling that relies on
-- implicit owner bypass; service-role app access is unaffected.
ALTER TABLE public.site_content FORCE ROW LEVEL SECURITY;

-- ── 3) Policies (hardened posture) ───────────────────────────────────────────
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

-- Explicitly drop the legacy permissive policy if a prod apply still has it.
DROP POLICY IF EXISTS authenticated_full_access_site_content ON public.site_content;

-- ── 4) Grants ────────────────────────────────────────────────────────────────
-- Read access for the public roles (RLS still restricts to published rows).
GRANT SELECT ON public.site_content TO anon, authenticated;
-- Full table privileges for the service role (used by supabaseAdmin).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO service_role;
-- NOTE: an existing prod table may still hold legacy INSERT/UPDATE/DELETE grants
-- for `authenticated`. RLS now neutralizes them (no write policy), but a future
-- reconciled migration may also REVOKE them for belt-and-suspenders:
--   REVOKE INSERT, UPDATE, DELETE ON public.site_content FROM authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — run AFTER applying in a NON-PROD environment)
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
-- Off-prod smoke (verified 2026-06-26 on local Postgres 17):
--   * anon: published visible, draft hidden.
--   * authenticated (incl. role=admin): SELECT published only; INSERT denied by
--     RLS; UPDATE/DELETE affect 0 rows; draft reads return 0.
--   * service_role: INSERT/UPDATE/DELETE and draft reads all succeed.
-- ============================================================================

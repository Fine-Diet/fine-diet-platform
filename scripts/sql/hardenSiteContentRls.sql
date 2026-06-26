-- ============================================================================
-- site_content — RLS HARDENING (Layer B)   *** DRAFT / NO-APPLY ***
--
--   Stage C prerequisite for /admin/programs-marketing writes (C3). This file
--   is prepared for REVIEW ONLY. DO NOT APPLY to any database (prod or
--   non-prod) without explicit sign-off. It is branch/PR documentation + SQL.
--
-- ----------------------------------------------------------------------------
-- PROBLEM THIS FIXES
-- ----------------------------------------------------------------------------
-- The live `public.site_content` table currently has these RLS policies:
--
--   1. anon_read_published
--        roles : public
--        cmd   : SELECT
--        using : (status = 'published')
--
--   2. authenticated_full_access_site_content        <-- THE PROBLEM
--        roles : public
--        cmd   : ALL  (SELECT/INSERT/UPDATE/DELETE)
--        using       : (auth.role() = 'authenticated')
--        with check  : (auth.role() = 'authenticated')
--
-- Policy #2 grants FULL read+write on site_content to ANY authenticated user.
-- Because the public site uses the Supabase anon key, any logged-in end user
-- holds an `authenticated` JWT and could write site_content DIRECTLY via
-- PostgREST/Supabase REST — entirely bypassing the Next.js admin API and its
-- RBAC guard (`requireRoleFromApi`). In particular a non-admin user could
-- INSERT/UPDATE `product:programs:*` and `composition:programs:*` rows at
-- status='published' and OPEN THE PUBLISH GATE / alter a live marketing page
-- without ever touching an admin endpoint.
--
-- All legitimate server-side access in the app goes through `supabaseAdmin`
-- (SERVICE_ROLE_KEY), which BYPASSES RLS. No application code path writes
-- site_content using an authenticated anon-key client. Therefore removing the
-- permissive authenticated write path is NON-BREAKING for the app and is pure
-- defense-in-depth.
--
-- ----------------------------------------------------------------------------
-- TARGET POSTURE (after apply)
-- ----------------------------------------------------------------------------
--   * Public (anon + authenticated) may SELECT published rows only.
--   * INSERT / UPDATE / DELETE: SERVICE ROLE ONLY.
--       - service_role bypasses RLS, so service-role writes already work; an
--         explicit service_role ALL policy is added for clarity/auditability
--         (mirrors scripts/sql/createStartPagesTable.sql).
--       - No authenticated-admin direct-write path is granted yet (deferred by
--         decision; admin writes continue to flow through supabaseAdmin behind
--         the admin API RBAC guard).
--   * Draft rows are readable only via the service role (admin API), never by
--     anon/authenticated clients. Admin draft reads already use supabaseAdmin,
--     so this does not break admin preview.
--
-- ----------------------------------------------------------------------------
-- SCOPE NOTE (shared surface)
-- ----------------------------------------------------------------------------
-- site_content is shared by integrative-care, SEO, navigation, home, journal,
-- feature-flags, products, etc. This change tightens WRITES for ALL of them.
-- This is intended (none of those write via an authenticated anon client), but
-- it MUST be reviewed as a cross-cutting change, not a programs-only one.
--
-- This script changes RLS POLICIES ONLY. It does not alter table columns,
-- constraints, indexes, triggers, or any row data. No offers/entitlements are
-- touched.
--
-- Idempotent: DROP POLICY IF EXISTS then CREATE. Safe to re-run.
-- ============================================================================

BEGIN;

-- Ensure RLS is on (no-op if already enabled; it currently is).
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
-- Defense-in-depth: also enforce RLS for the table owner so a non-service
-- owner connection cannot sidestep policies. (service_role still bypasses.)
ALTER TABLE public.site_content FORCE ROW LEVEL SECURITY;

-- ── 1) Remove the permissive authenticated full-access policy ────────────────
DROP POLICY IF EXISTS authenticated_full_access_site_content ON public.site_content;

-- ── 2) Preserve public read of PUBLISHED rows ───────────────────────────────
-- Recreated idempotently so the published-read contract is explicit and
-- version-controlled. Applies to the `public` grantee (anon + authenticated);
-- only published rows are visible.
DROP POLICY IF EXISTS anon_read_published ON public.site_content;
CREATE POLICY anon_read_published
  ON public.site_content
  FOR SELECT
  TO public
  USING (status = 'published');

-- ── 3) Service-role-only writes (and full access) ───────────────────────────
-- service_role bypasses RLS already; this explicit policy documents intent and
-- keeps the posture auditable. No anon/authenticated INSERT/UPDATE/DELETE
-- policy exists, so writes are denied to everyone except the service role.
DROP POLICY IF EXISTS service_role_manage_site_content ON public.site_content;
CREATE POLICY service_role_manage_site_content
  ON public.site_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — run AFTER applying in a NON-PROD environment)
-- ============================================================================
--
-- Expected policy set after apply (exactly 2 policies):
--
--   anon_read_published              | {public}       | SELECT | (status = 'published')
--   service_role_manage_site_content | {service_role} | ALL    | true / true
--
-- 1) List policies (expect the two rows above; NO authenticated ALL policy):
--
-- SELECT policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'site_content'
-- ORDER BY policyname;
--
-- 2) Assert the permissive policy is gone (expect 0):
--
-- SELECT count(*) AS permissive_authenticated_policies
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'site_content'
--   AND policyname = 'authenticated_full_access_site_content';
--
-- 3) Assert no anon/authenticated WRITE policy exists (expect 0):
--    (any INSERT/UPDATE/DELETE/ALL policy NOT scoped to service_role)
--
-- SELECT count(*) AS non_service_write_policies
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'site_content'
--   AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
--   AND NOT (roles = '{service_role}');
--
-- 4) Confirm RLS is enabled + forced:
--
-- SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
-- FROM pg_class WHERE oid = 'public.site_content'::regclass;
--
-- ----------------------------------------------------------------------------
-- POST-APPLY SMOKE (manual, NON-PROD only — do not run in prod):
--   * As an `authenticated` anon-key client: SELECT of a draft row -> 0 rows;
--     INSERT/UPDATE/DELETE -> permission denied.
--   * As anon: SELECT published -> visible; SELECT draft -> 0 rows.
--   * Via supabaseAdmin (service role): all reads/writes succeed (bypasses RLS).
--   * App regression: admin CMS save/publish (integrative-care, SEO, nav, home,
--     programs-marketing) still works because it uses supabaseAdmin.
-- ============================================================================

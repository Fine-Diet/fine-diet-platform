# Program content RLS candidate — 2026-11-03

## Scope and repository basis

This source-only candidate started from `origin/main` at `bfa004da5ebd78e7119b017ca72fdb79b64b7068` on branch `codex/program-content-rls-hardening-20261103`; it was rebased onto current `main` at `58e0fd656657bb1b118d5cafcf779cefde18a149` before review. It does not depend on the draft Payments PR #224. The separate Payments worktree contains uncommitted QA schema and documentation edits; those files were not changed.

The migration addresses direct Data API access to `program_modules`, `program_content_items`, and `program_delivery_modules`. It leaves publication, program-version, enrollment, day-window, and status-visibility policies in place and adds an independent current-access condition.

## Authorization rule

A signed-in person may read a program's published curriculum when either:

- `person_entitlements` contains an active `program:<slug>` entitlement whose start/end window includes the current time; or
- `program_assignments` contains an `active` assignment for the same slug whose active window includes the current time.

Enrollment state alone does not grant curriculum access. `program_delivery_modules` retains its existing permissive enrollment/status policy, so the new restrictive policy combines with it rather than replacing it. Published program metadata remains governed by the existing policy.

The migration removes all prior table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role` for these three tables, then restores only authenticated SELECT and service-role CRUD. It adds a `programs_private` SECURITY DEFINER boolean helper because the `people` and entitlement source tables have their own RLS; the helper is bound to `auth.uid()`, accepts no person identifier, uses an empty search path, and is executable only by `authenticated`. Application and admin routes continue using `service_role`.

The read-only Production catalog audit found no public views that select from these content tables. Content-related RPCs that were returned by the routine-definition scan (`create_program_version_draft`, `publish_program_version`, and the relationship trigger) are `SECURITY INVOKER` and executable only by `service_role`; they keep the same service-role access. `programs_private.current_person_ids()` is already `SECURITY DEFINER`, scoped to `auth.uid()`, non-executable by `anon`/`service_role`, and available to `authenticated`; the candidate does not replace it.

## Source and regression evidence

- Migration: `supabase/migrations/20261103090000_program_content_entitlement_rls.sql`
- Executable PostgreSQL fixture: `test/localdb/sql/programContentEntitlementRls.sql`
- Runner: `test/localdb/run-program-content-entitlement-rls.sh`
- Command: `test/localdb/run-program-content-entitlement-rls.sh`
- Result: PASS on PostgreSQL 17.11 (27 role/grant assertions); anonymous SELECT privilege removed; unentitled and wrong-person/wrong-program reads denied; valid exact program entitlement and active assignment allowed; journal-only, future, expired, revoked, future-assignment, expired-assignment, and cancelled-assignment access denied; authenticated users cannot write curriculum; service-role CRUD preserved; delivery remains subject to active/paused/completed visibility and denies cancelled enrollment.

The test executes the candidate migration against a disposable local database with real `anon`, `authenticated`, and `service_role` roles. It does not contact Supabase. Existing runtime or hosted authentication, Stripe lifecycle, production view/RPC exposure, and cancellation/renewal behavior remain outside this result and must not be reported as verified here.

## Rollout and recovery

Run the migration only after reviewing the exact live schema/policy preflight in the file. The migration is transactional and sets bounded lock and statement timeouts; a preflight or DDL failure rolls back the complete transaction. Apply it first to an isolated development database with current Programs content and verify signed-in entitlement and assignment delivery through the actual application routes.

Do not roll back by restoring the previous anonymous/public content grants or by dropping the restrictive policies while authenticated table SELECT remains granted. If route compatibility regresses, keep direct access closed and use the existing service-role route path while correcting forward. Remove these policies/helper only in a replacement migration that installs an equally strong authorization rule and preserves the grants boundary.

No hosted database was mutated, and this candidate is not production-approved. The next release gate is isolated application-level compatibility review and independent security review before any production migration/deployment decision.


## Application compatibility gate — 2026-11-03

### Application/API findings and correction

The first API/service integration pass found two service-role authorization gaps that RLS alone cannot close: `getLibraryDetailForPerson()` treated any assignment history as access, and the progress writer did the same. A cancelled, expired, future, paused, or completed assignment could therefore pass an application check while a service-role query bypassed database RLS. The detail service now requires a current entitlement or an `active_now` assignment; the progress writer now checks `listActiveAssignmentsForPerson()`. Historical assignment rows remain visible in the library list, but cannot authorize curriculum detail or progress writes. The integration tests exercise the signed-in detail and delivery route handlers with current and revoked/expired/future entitlement and assignment states, wrong-person data, and valid admin assignment access. A focused progress-service test covers deny-without-current-access and permit-with-current-assignment.

Public marketing/discovery is compatible: the reviewed `/programs` routes and marketing catalogue tests use `program_series`, catalogue metadata, and product/site content. They do not query `program_modules`, `program_content_items`, or `program_delivery_modules` anonymously. Admin authoring/grant tests continue to use server-side service access. Baseline delivery tests retain authorized pre-start, paused, and completed historical day behavior while cancelled enrollment remains denied.

### Results

- `test/localdb/run-program-content-entitlement-rls.sh`: PASS, PostgreSQL 17.11, 27 role/grant assertions; temporary local DB only.
- Programs compatibility Jest selection: PASS, 18 suites / 201 tests after adding current-access regression coverage. The selection includes API/service integration, detail/delivery routes, Baseline member delivery, runtime lifecycle, marketing catalogue/discovery, admin grants/authoring, and content policy tests.
- The API/service integration uses mocked Supabase client and auth boundaries while executing real route handlers and the real library/content-delivery services. The PostgreSQL fixture separately tests the migration using real Postgres roles and grants. There was no hosted PostgREST/Auth integration test or Production access.
- Branch preview deployment is disabled for `codex/program-content-rls-hardening-20261103` in `vercel.json`, because this task explicitly prohibits deployment. No deployment command was run.

### Security and performance review

The helper is `SECURITY DEFINER`, accepts only a program UUID, binds the person lookup to `auth.uid()`, returns a boolean, and sets `search_path = ''`; all relation and built-in references are schema-qualified. PUBLIC, anon, service_role, and initially authenticated EXECUTE are revoked before granting EXECUTE only to authenticated; `programs_private` schema usage is granted only to authenticated among API roles. It neither accepts a caller-selected person nor exposes entitlement rows. Its caller still needs SELECT table privilege, and it composes with the pre-existing permissive publication/enrollment rules as a restrictive policy. Anonymous table SELECT is removed; service_role CRUD is retained explicitly.

The policy checks use correlated `EXISTS` predicates on people/auth_user_id, entitlement/person_id + entitlement_key + time window, and assignment/person_id + program_slug + status + time window. This avoids row multiplication and exposes no joined records. The repository migration history does not declare indexes for those lookup combinations, and the local fixture is too small to estimate production latency. Before production rollout, inspect the actual indexes and run `EXPLAIN (ANALYZE, BUFFERS)` on an isolated copy with production-like row counts; add only evidence-supported indexes in a separate reviewed migration if needed. The repeated per-row helper cost for large curriculum reads also remains an isolated performance measurement gate.

### Rollout and rollback

1. Independent security review the draft PR; then apply the migration only to an isolated Supabase development project and rerun authenticated PostgREST reads plus Programs route checks against seeded valid and invalid access cases.
2. Observe query plans and latency at realistic table sizes before production approval. Production schema changes and deployment require a separate release decision; neither is part of this PR.
3. If the transaction fails before commit, PostgreSQL rolls the migration back atomically. If an issue is found after an isolated or production application, keep direct grants closed and retain the restrictive policies. Correct forward with a replacement migration. Do not restore anonymous grants or remove the current-access policy as a rollback, because that reopens the release blocker. A replacement must preserve equivalent entitlement/assignment authorization and the service-role-only write boundary.
4. The branch deployment is currently disabled. To permit any later Preview deployment, remove the branch-specific `deploymentEnabled: false` entry only in a separately reviewed change after the no-deploy gate is lifted.

This is local application compatibility evidence only. Hosted signed-in member access, hosted RLS behavior, and production-scale query performance remain unverified.

## Independent source-review follow-up — 2026-11-03

The independent PR #225 source review found that ordinary enrollment could use historical assignment rows, and that program-day/check-in actions did not independently require current program access. Runtime summaries could also include the next authored check-in template after an entitlement ended. These paths used privileged server queries and were not covered by direct-table RLS alone.

The follow-up correction adds `lib/programs/programAccessServerService.ts` as a shared current-access resolver: it accepts a currently valid `program:<slug>` entitlement or an active assignment inside its effective window. Ordinary enrollment source resolution and validation now use that resolver; explicit `verified_admin_grant` authorization remains limited to the existing verified admin grant route. Day observations, day completion, and check-in submissions now require current program-specific access. Access denial maps to HTTP 403. Runtime summaries preserve the person's own enrollment and historical response/recommendation metadata, but omit `next_checkin_template` when current program access is absent. No lifecycle or authentication routes were changed.

Focused regressions cover revoked, expired, and future entitlements; cancelled, expired, future, and wrong-person assignments; valid entitlement and assignment enrollment; verified admin grants; check-in/day action denial after revocation; valid current access; and retaining historical summary metadata while suppressing protected authored prompt content. The PostgreSQL fixture gained two explicit `program_content_items` grant checks so the named 27 role/grant assertions are present in the executable fixture.

### Follow-up verification

- `test/localdb/run-program-content-entitlement-rls.sh`: PASS, PostgreSQL 17.11, 27/27 role/grant assertions; disposable local database only.
- `node_modules/.bin/jest --runInBand lib/programs pages/api/journal/programs`: PASS, 48 suites / 521 tests, including the existing Programs coverage and new access-gate/API/runtime-summary cases.
- `git diff --check`: PASS.
- `npx tsc --noEmit`: repository-wide check remains failing with existing test-global/module declaration diagnostics across unrelated files (19,936 diagnostic lines); no diagnostics matched the modified production service or API files.
- Hosted Supabase/PostgREST behavior, real signed-in hosted sessions, and production-scale query performance remain unverified. No Production SQL, deployment, Stripe, or PR #224 changes were made.

The migration remains source-only and transactional. If a compatibility issue appears after application, keep direct content grants closed and correct forward with an equivalent entitlement-aware policy. The draft PR stays open for independent security review; this evidence does not approve rollout or Production application.

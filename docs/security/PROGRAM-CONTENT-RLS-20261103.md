# Program content RLS candidate — 2026-11-03

## Scope and repository basis

This source-only candidate is based on `origin/main` at `bfa004da5ebd78e7119b017ca72fdb79b64b7068`, on branch `codex/program-content-rls-hardening-20261103`. It does not depend on the draft Payments PR #224. The separate Payments worktree contains uncommitted QA schema and documentation edits; those files were not changed.

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

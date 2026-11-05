# PR #225 targeted RLS fixture — 2026-11-04

## Scope and disposition

This is a narrowly scoped authorization fixture built from read-only Production catalog metadata for the nine public tables that participate in program access and delivery policies: `people`, `programs`, `program_modules`, `program_content_items`, `program_delivery_modules`, `person_entitlements`, `program_assignments`, `program_versions`, and `program_enrollments`.

It is **not** a full Production schema replica or a replacement for the unfinished canonical schema recovery. It contains synthetic rows only and does not replay the historical migration chain. No Production customer rows were queried or exported.

The offline targeted fixture is ready for hosted validation: the unchanged PR #225 migration applied successfully and the local PostgreSQL role/policy suite passed. Hosted validation itself is still pending fresh cost approval before another billable Supabase branch can be created.

## Read-only catalog findings

The nine tables all have RLS enabled and `FORCE ROW LEVEL SECURITY` disabled. Production table ownership is `postgres`. Relevant lookup indexes include:

- `people_auth_user_id_idx` on `people(auth_user_id)`.
- `idx_person_entitlements_lookup` on `(person_id, entitlement_key, is_active)` and the active, unbounded entitlement unique index.
- `idx_program_assignments_person_slug_status` on `(person_id, program_slug, status)`.
- `idx_program_modules_program_ord` on `(program_id, ordinal)`.
- `idx_program_content_items_module_ord` on `(module_id, ordinal)`.
- `idx_program_versions_program_status` on `(program_id, status, version_number DESC)`.
- Enrollment indexes on person/slug/status and program version.
- Delivery-module indexes on program/version/display order and status, plus the unique key index using `COALESCE(program_version_id, zero_uuid)`.

Catalog inspection also covered every column, default, nullability, primary/foreign/unique/check constraint, valid index definition, explicit ACL, effective API-role SELECT privilege, RLS flag, and policy on those tables. The offline DDL intentionally keeps only columns, key/check constraints, and indexes needed to evaluate the authorization predicates and delivery-day behavior; it omits unrelated application columns and constraints.

The schema-to-fixture comparison is:

| Production table | Fixture columns used | Deliberate omissions |
|---|---|---|
| `people` | `id`, `email`, `auth_user_id`, `status` | marketing/contact metadata and unrelated indexes/checks |
| `programs` | `id`, `slug`, `status` | title/storefront/metadata/audit fields |
| `program_modules` | `id`, `program_id`, `status`, `ordinal` | title/description/metadata/audit fields |
| `program_content_items` | `id`, `module_id`, `item_type`, `title`, `body`, `status`, `ordinal` | summary/video/duration/metadata/audit fields |
| `program_delivery_modules` | identity/program/version, module key/type, status/visibility, display order, day range | authoring prose, safety/capacity/CTA/anchor JSON and other delivery metadata |
| `person_entitlements` | `id`, `person_id`, key, active flag, start/end | source/note/actor/audit fields |
| `program_assignments` | `id`, `person_id`, slug, status, active window | acquisition/source/priority/notes/actor/audit fields |
| `program_versions` | `id`, `program_id`, key, status, duration | labels/number/publish metadata and actor/audit fields |
| `program_enrollments` | identity/person/program/version, status, selected start, completion, timezone, paused days, metadata | source/provenance, snapshots, capacity, pause-until, actor/audit fields |

All nine Production relations report RLS enabled and `FORCE RLS` off. The fixture reproduces the policy dependencies' key FKs and status/window checks plus lookup indexes listed above; it does not copy unrelated schema details. The pre-migration ACL test models the observed broad anon/authenticated grants on modules and content items and the authenticated SELECT/service-role CRUD split on delivery modules. The migration's resulting grants are asserted separately.

### Current Production policies before PR #225

- `programs`: permissive SELECT to `PUBLIC` for published rows. This intentionally keeps published catalogue metadata discoverable.
- `program_modules`: permissive SELECT to `PUBLIC` when the module and its parent program are published. It does not check an entitlement.
- `program_content_items`: permissive SELECT to `PUBLIC` when the item, its module, and the parent program are published. It does not check an entitlement.
- `program_delivery_modules`: authenticated SELECT requires a published delivery row; an enrollment belonging to `programs_private.current_person_ids()`; the same program and version across enrollment, version, and module; a published program and version; a non-cancelled enrollment; configured `status_visibility`; and the appropriate day window.
- `program_enrollments` and `program_versions`: authenticated reads are person-scoped through `current_person_ids()`; versions additionally require a published version/program and non-cancelled enrollment.
- `program_assignments`: self-read predicate joins `people.auth_user_id` to `auth.uid()`.
- `person_entitlements`: self-read plus admin/editor read/write policies using `public.current_user_role()`, and a service-role all-operations policy.
- `people`: RLS is enabled and there is no permissive member policy. The private identity helper is what permits identity resolution without a direct people-table read.

Before the candidate migration, Production grants broad privileges on `program_modules` and `program_content_items` to `anon` and `authenticated`; their `PUBLIC` policies therefore make published curriculum directly readable. `program_delivery_modules` has authenticated SELECT and service-role CRUD, with no anonymous SELECT. The migration revokes all direct privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role` on the three protected tables, then restores authenticated SELECT and service-role CRUD.

### Function dependencies and privileges

- `auth.uid()` is SQL, STABLE, SECURITY INVOKER, and accepts Supabase's `request.jwt.claim.sub` or claims JSON `sub`. It is executable by API roles through `PUBLIC`.
- `programs_private.current_person_ids()` is SQL, STABLE, SECURITY DEFINER, owned by `postgres`, and has `search_path = ''`. It selects only `people.id` rows whose `auth_user_id = auth.uid()`. Its schema usage and function EXECUTE are available to `authenticated`, not `anon` or `service_role`.
- `programs_private.paused_historical_day(date,text,text,integer,integer)` is PL/pgSQL, STABLE, SECURITY INVOKER, and has `search_path = ''`. It validates the pause date and returns a nonnegative historical day bounded by the pause point, current day, and version duration. EXECUTE is available to `authenticated`, not `anon` or `service_role`.
- `public.current_user_role()` is SQL, STABLE, SECURITY INVOKER, and reads `profiles.role` for `auth.uid()`. EXECUTE is available to `PUBLIC`; the referenced `profiles` table has RLS for own-profile reads and service-role administration.
- The PR #225 helper is new: it is SECURITY DEFINER, accepts only a program UUID, resolves the person solely from `auth.uid()`, uses an empty search path and schema-qualified references, returns a boolean, and is executable only by `authenticated` after the migration.

The fixture reproduces these helper contracts and the current private function grants. `auth.users` and `profiles` are synthetic minimal dependencies; no Production Auth or profile rows were read.

## Delivery status and day-window behavior preserved

Production's delivery policy does not reduce access to “enrollment exists.” It permits visible delivery only for a published, matching program/version and a non-cancelled enrollment. Status is derived as completed, paused, pre-start, or active and must appear in `status_visibility`.

- Active delivery is limited by the current program day; a future `day_start` is hidden.
- Pre-start enrollment exposes only configured pre-start modules at day zero.
- Paused and completed delivery requires non-null, valid `day_start`/`day_end` and one of the historical module types (`prep`, `week`, `practice_card`, `guide`, `capacity_support`, `roadmap`).
- Paused delivery is capped by `paused_historical_day()`; completed delivery is capped by completion/current day and published version duration.
- A cancelled enrollment remains denied even if a visibility array contains `cancelled`.

The offline suite tests pre-start, active, paused historical cutoff, completed duration cutoff, cancellation, and future-day visibility. It also retains the publication checks for programs/modules/items. The candidate's restrictive policy adds current entitlement/assignment access with AND semantics; it does not replace the existing permissive day/publication predicates.

## Comparison with the previous disposable fixture

The prior fixture was materially simplified and did **not** reproduce the full Production delivery decision. Differences corrected here:

1. It used only identifier/status columns on most tables and omitted the real entitlement and assignment lookup indexes, constraints, and table grant boundary.
2. It omitted `profiles` and `public.current_user_role()` referenced by the admin/editor entitlement policies.
3. Its `programs_private.current_person_ids()` stub was close in shape but its `people` table had a direct self-read policy; Production has no permissive `people` policy. The fixture now reflects that boundary and tests the SECURITY DEFINER resolver.
4. It did not include `programs_private.paused_historical_day()` or the Production `program_delivery_modules` predicate's day calculations, version/program consistency check, allowed historical module types, or exact status visibility logic.
5. Its status visibility sample and paused/completed tests were therefore insufficient to establish compatibility with Production's historical delivery behavior.

The updated fixture defines the Production permissive policies before applying the candidate migration unchanged. It retains exact authorization behavior for those predicates, the helper contracts/ACLs, relevant policy lookup indexes, and the target table grant boundary. It remains a focused behavior fixture, not byte-for-byte DDL equivalence: non-policy columns, unrelated constraints/indexes, other schemas, triggers, RPCs, and Data API/Auth runtime configuration are outside its scope.

## Offline test evidence

Command:

```sh
test/localdb/run-program-content-entitlement-rls.sh
```

Result: **PASS** on disposable PostgreSQL 17.11. The script initialized a temporary local database, applied the Production-derived fixture, applied `supabase/migrations/20261103090000_program_content_entitlement_rls.sql` unchanged, and exercised actual `anon`, `authenticated`, and `service_role` database roles. Fixture cleanup removes the temporary cluster when the script exits.

The existing Programs regression selection also passed after the fixture expansion: `node_modules/.bin/jest --runInBand lib/programs pages/api/journal/programs` — **48 suites / 521 tests passed**. `git diff --check` passed.

Covered outcomes include:

- Anonymous catalogue metadata remains readable while direct module/item SELECT is denied by the revoked grant.
- Authenticated no-entitlement and wrong-person access are denied despite historical enrollment ownership.
- Current program entitlement permits published same-program modules/items; wrong-program and draft content remain denied.
- Own enrollment and published-version metadata remain readable after program access loss, while protected curriculum and delivery remain denied. Cancelled enrollment no longer exposes the published version through its existing non-cancelled enrollment policy.
- Journal-only, revoked, expired, future entitlements and cancelled/expired/future assignments are denied; a current active in-window assignment permits its named program only.
- Assignment/entitlement alone does not bypass delivery's own enrollment and day/status policy.
- Active/pre-start day visibility, future-day denial, paused historical cutoff, completed duration cutoff, and cancellation denial behave as in the Production policy.
- Program/version mismatch, unpublished version, and a state absent from `status_visibility` are denied.
- Authenticated curriculum writes and helper execution are denied; service-role SELECT/INSERT/UPDATE/DELETE remain available across all three curriculum tables.

The final SQL run passed **58 `assert_count` assertions** plus **2 expected direct SELECT permission-denial probes**.

The PostgreSQL role tests are local RLS evidence. They are not real hosted Auth sessions or PostgREST requests. The targeted fixture also does not establish complete Production schema equivalence or production-scale performance.

## Hosted validation runbook — not executed

No branch was provisioned for this task. Before provisioning, obtain fresh approval for the quoted branch cost. Then create exactly one nonpersistent branch with `with_data=false`, verify its project ref/parent and deletion path, and seed only synthetic identities/records.

Use three distinct synthetic Auth users: one with a current entitlement, one with no entitlement, and one whose entitlement belongs to another person/program. Add controlled active, future, expired, and revoked entitlement/assignment rows and enrollments in pre-start, active, paused, completed, and cancelled states. Use the actual Auth signup/admin fixture path, retain credentials only in the secure test runner, then use those users' real access tokens against PostgREST and member routes. Test anonymous catalogue routes, direct module/item reads, delivery reads, wrong-person/program requests, and unauthorized writes. Verify service-role authoring separately with a protected server-side credential path; never expose keys or tokens in evidence.

For performance, capture `EXPLAIN (ANALYZE, BUFFERS)` for authorized and denied module, content-item, delivery, and helper lookup queries on synthetic representative data volumes. Record plan nodes, index use, execution time, and shared hit/read buffers. The current indexes are promising lookup candidates but no latency claim is made from this small local fixture.

After capturing redacted evidence, delete the isolated branch and verify it no longer appears in the project branch inventory. Remove synthetic Auth users/data first if branch deletion does not discard them automatically. Do not apply Production SQL, deploy, or merge as part of this gate.

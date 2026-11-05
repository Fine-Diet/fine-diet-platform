# PR #225 hosted RLS verification preparation — 2026-11-04

## Status

Hosted-specific setup and runner are prepared, but **not ready to execute**. No branch was created and no hosted database was changed. The founder has approved one temporary nonpersistent zero-data branch at `$0.01344/hour` plus applicable usage; this existing approval remains in force unless the quoted cost or scope changes. The run still needs accessible branch-specific credentials and exactly one separately provisioned isolated branch.

This is a targeted authorization fixture derived from read-only Production catalog metadata. It is not a complete Production schema replica, does not replay the historical migration chain, and is not evidence of hosted Auth/PostgREST behavior.

## Files

- `test/hosted/programContentEntitlementRlsHostedSetup.sql` contains the policy-relevant application tables, indexes, grants, helper functions, and policies. It preflights that Supabase roles and `auth.users`, `auth.uid()`, and `auth.role()` already exist. It never creates or alters Supabase-managed Auth schemas, roles, users, or JWT functions.
- `test/hosted/runProgramContentRlsHosted.mjs` validates branch identity before any database operation, applies only this targeted setup and the unchanged PR #225 migration, creates test identities through Supabase Auth Admin, signs them in through password Auth, and tests real PostgREST requests. On any post-identity outcome it attempts synthetic identity cleanup, deletes the ephemeral branch, and verifies absence in the Production parent's branch inventory.
- `test/hosted/hostedRunnerCore.mjs` contains isolated, dependency-injected validation helpers for branch identity, multiline plan parsing, write-attempt tracking, privileged authoring, passfile permissions, and cleanup confirmation.
- `test/hosted/testProgramContentRlsHostedRunnerSafety.mjs` proves that Production, both QA references, and the retired branch reference are rejected before Management API or database access.
- `test/hosted/programContentEntitlementRlsManifest.json` records the run contract, prohibited refs, scenarios, required secret names, performance volumes, and known limitations.
- `test/localdb/sql/programContentEntitlementRls.sql` now imports the hosted-safe SQL after its explicitly local-only role/Auth shim, so the same application setup can be checked offline.

The candidate migration remains unchanged. The runner stores no API keys, access tokens, database passwords, synthetic passwords, or session tokens in evidence. Its evidence output is written outside the repository with mode `0600`.

SHA-256: hosted setup `7344644f76ffd472b12f7fd56c06c4669df9f74458ac5fd77a7d979b4610294e`; unchanged candidate migration `49ad5e409f43058ad28804654308eaa23598970cbf6c7a9c245ef7fff4a73610`.

## Branch safety boundary

Provision exactly one fresh disposable branch under the existing founder approval; no duplicate cost approval is needed unless price or scope changes. The runner does not create a branch. It requires:

- parent project `tssvlflebugqhtogqdfs`;
- a branch name matching `fine-diet-pr225-rls-YYYYMMDDtHHMMSSz`;
- `with_data=false`, nonpersistent, nondefault status, and `ACTIVE_HEALTHY` preview database;
- an explicitly repeated target reference matching the Management API branch record.

The runner hard-rejects Production `tssvlflebugqhtogqdfs`, Payments QA `ikvkqpbwlpevqlshdkdz`, Food Log QA `ymdhsvuaixiwhlioiree`, and the retired temporary ref `slsmfdxxqktkgplliwhx`. A verified target is automatically deleted after an attempt; branch absence must be verified before considering cleanup complete.

The targeted setup preflight also requires the nine application tables, `programs_private`, and `public.current_user_role()` to be absent. This protects against silently replacing or layering over a partially replayed schema. If the new branch migration bootstrap leaves any of those objects behind, the runner will stop and clean up the branch; that state must be resolved as a setup mismatch before another hosted attempt.

## Required inputs

Supply these names through a protected environment or secret manager; never put values in command history, source files, or evidence:

`FINE_DIET_RLS_TARGET_REF`, `FINE_DIET_RLS_EXPECTED_REF`, `FINE_DIET_RLS_BRANCH_NAME`, `FINE_DIET_RLS_COST_APPROVED=YES`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `PGPASSFILE`.

The Management API token needs access to list and delete the temporary branch. The Supabase secret key is server-side only and used for read-only Auth Admin preflight plus service-role database operations. The Postgres passfile must be protected (mode `0600` or stricter); host/database selection is derived from the verified branch ref, never from an arbitrary URL. Before setup writes, the runner now checks PostgREST's API root, Auth Admin `listUsers` capability, and TLS PostgreSQL connectivity. Check that the disposable branch's Auth email/password provider permits confirmed synthetic accounts before running.

## Execution

From repository root after the approved branch exists and all credential inputs are available:

```sh
node --check test/hosted/runProgramContentRlsHosted.mjs
node test/hosted/testProgramContentRlsHostedRunnerSafety.mjs
node test/hosted/runProgramContentRlsHosted.mjs
```

The runner defaults to a timestamped redacted JSON evidence file under `/private/tmp`. Set `FINE_DIET_RLS_EVIDENCE_PATH` to a protected location if needed. Keep the generated evidence with the PR security record after checking it contains no secrets. The runner records any setup/test failure and still attempts deletion once branch identity is established.

The hosted checks cover anonymous catalog visibility versus direct content denial; Auth-created and Auth-signed-in member identities with current, absent, expired, future, assignment, wrong-program, and revoked access; legitimate admin entitlement grant/revoke; denied member authoring; and service-role authoring through server-side privileged `supabase-js` PostgREST operations. It preserves the member's own historical enrollment/version metadata after access revocation. PostgREST endpoint and Auth Admin read-only capability preflights run before schema writes.

For performance, the runner inserts synthetic decoy data (10,000 entitlement rows, 10,000 assignment rows, and 500 additional rows in each content delivery table), runs `ANALYZE`, then captures `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on protected helper/module/item/delivery queries. These plans support index/policy review only; they are not production-scale performance claims.

## Rollback and cleanup

All hosted setup and candidate-migration writes target only the verified disposable branch. The runner deletes synthetic Auth users and rows, then deletes the whole branch through the Supabase Management API and polls the parent branch inventory until the ref is absent (90-second timeout). Branch deletion is the final rollback for any partial setup. If automated cleanup reports failure, use the Supabase Dashboard/Management API to delete that exact verified temporary branch and independently confirm it is absent before ending the test.

No Production SQL, deployment, merge, Payments QA, Stripe, or Food Search operation is part of this procedure.

## Offline evidence and limitations

The local SQL runner passed against disposable PostgreSQL 17.11 after importing this hosted-safe application setup: **58 SQL assertions passed and 2 expected permission-denial probes passed**. The runner safety test also passed for all 4 protected/retired project references, both Node files passed `node --check`, and `git diff --check` passed. The local SQL execution requires a test-only Auth schema, role definitions, and JWT claim functions supplied by the local prelude. It confirms SQL compatibility for the targeted fixture only; it does not create or emulate the hosted Auth API or prove PostgREST behavior. The local environment has PostgreSQL/`psql` but no Supabase CLI, Docker, or Podman, so a full local Supabase Auth + PostgREST stack was unavailable.

## Credential preflight on 2026-11-04

- The connected Supabase management tool successfully listed the Production branch inventory read-only. This confirms connector access only; it does not provide the direct Management API bearer token the standalone runner requires.
- The local process environment has no `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, or `PGPASSFILE`. The Supabase CLI access-token file and default `.pgpass` file are absent. `psql` is installed; Supabase CLI, Docker, and Podman are unavailable.
- Therefore the branch-specific PostgREST key, Auth Admin credential, PostgreSQL passfile/connectivity, and actual protected passfile metadata cannot yet be verified. No Production/QA key or password was read or reused. No branch was provisioned. The no-network tests confirm the runner fails closed when the direct Management API credential is missing.

## Separate verification verdicts at this checkpoint

- **Hosted RLS/Auth:** NOT VERIFIED; no hosted branch/test was run.
- **Hosted performance:** NOT VERIFIED; synthetic query plans were not captured.
- **Cleanup:** mocked success, unhealthy-branch, missing-ref, Management API failure, and absence-timeout paths PASS; no real hosted branch deletion was performed.
- **Next.js member API compatibility:** NOT VERIFIED by this hosted runner. It does not exercise deployed `runtime-summary`, observation, completion, or check-in API routes.
- **Local RLS fixture:** PASS on disposable PostgreSQL 17.11 (58 SQL assertions + 2 expected SELECT-denial probes, per the recorded run); this does not substitute for hosted behavior.

The final gate remains real hosted Auth/PostgREST and query-plan execution on the already approved, isolated, zero-data branch. A direct Management API token and the eventual branch-specific publishable key, server-side key, and protected database passfile must first be made available through authorized secret storage without disclosing their values. PR #225 must remain draft and unmerged until independent security review accepts the hosted evidence.

## Supabase references

- [Auth Admin `createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Management API: list branches](https://supabase.com/docs/reference/api/v1-list-all-branches)
- [Management API: delete a branch](https://supabase.com/docs/reference/api/v1-delete-a-branch)

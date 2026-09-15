# NDS Integrity v1 — canonical release and activation runbook (NDS-01C)

This is the **canonical operator runbook** for NDS Integrity v1 on branch
`fix/nds-integrity-v1`. It supersedes operator order in:

- `docs/nds/NDS-01-MIGRATION-ACTIVATION.md` (historical NDS-01 three-file sequence)
- `docs/nds/NDS-01A-MIGRATION-ACTIVATION.md` (01A cutover without step 05)
- `docs/nds/NDS-01B-MIGRATION-ACTIVATION.md` (01B local notes)

Those files remain as packet history. **Do not follow them for a live activation.**
The verified local sequence is:

`01 → 02 → 05 → 03 → 04`

Rollback file: `scripts/sql/ndsIntegrityV1_99_rollback.sql`.

NDS-01C **product implementation is accepted**. This document is activation
procedure only. It does not change formula, scoring weights, or missing-added-sugar
policy.

## Status: NO REMOTE APPLICATION HAS OCCURRED

None of these SQL files has been run against production, staging, preview,
or any connected/shared database. Local rehearsal used run-owned disposable
PostgreSQL clusters from `test/localdb` and the NDS-01C G1 harness. There is no
`supabase/migrations/` directory; operators apply camelCase files under
`scripts/sql/` in this order.

Do not treat a Git-connected Vercel preview as schema activation. Preview
validates the application build only.

## Files

| Order | File | Phase |
| --- | --- | --- |
| 1 | `scripts/sql/ndsIntegrityV1_01_dayRevisions.sql` | pre-deploy expand |
| 2 | `scripts/sql/ndsIntegrityV1_02_resolverAndWorker.sql` | pre-deploy expand |
| 3 | `scripts/sql/ndsIntegrityV1_05_identityAndGrants.sql` | pre-deploy expand (identity + grants) |
| 4 | `scripts/sql/ndsIntegrityV1_03_legacyCutover.sql` | transfer / cutover ledger |
| 5 | `scripts/sql/ndsIntegrityV1_04_contract.sql` | contract (after drain) |
| — | `scripts/sql/ndsIntegrityV1_99_rollback.sql` | rollback |

This matches `EXPAND_MIGRATIONS` then `CUTOVER_MIGRATION` then
`CONTRACT_MIGRATION` in `test/localdb/harness.ts`.

## Phase A — Pre-deploy expand (additive, before app deploy)

Both 01 and 02 are additive. They do not drop tables, rewrite journal rows, or
backfill consumed-day history. 05 is idempotent alignment of computation identity
and grants for clusters that already had an older 02 seed.

1. Apply **01**. Installs `nds_consumed_day`, `journal_day_revisions`, the
   revision trigger, `people.consumed_time_zone`, and RLS/grants. New journal
   mutations begin advancing revisions. Nothing in the old app reads them yet.
2. Apply **02**. Adds `daily_nds` validity columns, the generation fence,
   snapshot/publish RPCs, and `nds_recompute_work`. The legacy
   `nds_recompute_queue` trigger remains attached alongside the new writer.
3. Apply **05**. Ensures `nds_assert_generation_matches_source` (including
   dependency fingerprint), `nds_advance_generation`, `nds_operator` vs
   `service_role` grants, and that browser roles `anon` / `authenticated` have
   no execute on privileged functions.

Stop here until the application that **reads** this contract is ready to deploy.
Cached scores still have `source_revision IS NULL` and must not be grandfathered
as fresh.

## Phase B — Transfer / cutover (legacy queue → new work)

4. Apply **03** (`ndsIntegrityV1_03_legacyCutover.sql`).
   `nds_transfer_legacy_queue()` copies outstanding legacy identities into
   `nds_recompute_work` and writes `nds_legacy_transfer_ledger`. Legacy status
   is **not** rewritten to completed.
5. Repeat transfer until `transferred = 0` on a quiet boundary. Concurrent
   journal writes keep requesting new work; they are not lost.
6. “Transferred” is not “recomputed.” Do not run **04** yet.

## Phase C — Application deployment

7. Deploy the NDS-01C application (the build that uses the resolver, fenced
   worker, and non-numeric daily states). Until this deploy, old writers ignore
   the new columns.
8. Do **not** treat leftover v1 metadata as an old-writer success if you later
   roll the app back.

## Phase D — Verification (before contract)

9. Confirm `nds_work_diagnostics()` (or equivalent) shows work being claimed.
10. Confirm newly computed `daily_nds` rows carry `source_revision`,
    `computation_generation`, and a truthful `response_state`.
11. Confirm no browser role holds `EXECUTE` on privileged NDS functions (the
    verification queries at the end of the SQL files).

## Phase E — Worker drain and materialization

12. Run the real worker until outstanding work for transferred days is
    processed (`processed_revision` / `processed_generation` catch requested
    identity). A cache hit after a validated publish is completion; do not
    mark complete without materialization.
13. Spot-check that a day whose added-sugar evidence is missing stays
    **non-numeric** (`insufficient_data` / UI “Not scored” or “insufficient
    evidence”). See [Release impact](#release-impact-accepted).

## Phase F — Contract

14. Stop old enqueue/writer activity.
15. Apply **04** only after cutover succeeded and the new worker is draining.
    `nds_assert_ready_to_contract()` refuses if the legacy enqueue trigger is
    still attached or untransferred `pending`/`processing` rows remain.

## Rollback ordering

**Roll back the application first.** Expand is additive, so an application
rollback alone is already a safe resting state: old code ignores the new
columns, tables, and triggers. Run schema rollback only if the schema itself
must stop writing on the v1 path.

The canonical non-destructive schema rollback is **one file**:
`scripts/sql/ndsIntegrityV1_99_rollback.sql`. Do not also rerun
`createDailyNDSTables.sql`. File 99 already restores the legacy enqueue path
before it detaches the new writers, so there is no window in which neither
path records a change.

1. Roll back the application deployment.
2. Apply `ndsIntegrityV1_99_rollback.sql` as written (`psql -v ON_ERROR_STOP=1
   -f scripts/sql/ndsIntegrityV1_99_rollback.sql`). In file order it:
   - invalidates repaired `daily_nds` materializations and **releases the
     writer fence** (and the state contract) so a pre-v1 writer can write
     again;
   - recreates `enqueue_nds_recompute()` and `trigger_enqueue_nds_recompute`
     (undoing contract step 04);
   - then detaches `trigger_nds_request_work` / `trigger_nds_track_journal_day_revision`
     (and related functions).
3. **Stop.** At this point the schema is inert: new tables and columns still
   exist, nothing writes to them, and the legacy enqueue trigger is attached.
   That is the verified safe resting state.
4. Uncomment section 3 of file 99 **only** if destructive cleanup is explicitly
   required. Those drops stay commented by default: dropping
   `journal_day_revisions` discards recorded revisions; dropping `daily_nds`
   validity columns discards persisted readings, provenance, and coverage.

## Release impact (accepted)

Catalog foods store total sugar, not added sugar. This branch does **not**
substitute total sugar or treat missing as measured zero. Unknown added sugar
keeps `added_sugar_unknown` provenance (`added_sugar_g` may be null).

`SCORE_DAYS_WITHOUT_ADDED_SUGAR_EVIDENCE` in `lib/nds/resolveDailyNDS.ts` is
`true`: an otherwise-scorable day still receives a numeric NDS using the existing
lower-bound assumption, including when added-sugar coverage is `unknown` or
`partial`. Coverage and the `added_sugar_unknown` limitation are preserved;
displayed `added_sugar_g` stays null unless coverage is fully `known`. The
dependency fingerprint includes `score_without_added_sugar=1` so prior-policy
cached rows invalidate. **Do not change formula weights in this runbook.**

A day whose score is behind its newest entry is labelled `updating` rather than
shown as current.

## What consumed-day metadata does not change

`payload.consumed_day` is server-authored and absent on history written before
this contract, and on writes where the subject's timezone is unknown. Absence
routes reads to the labelled UTC compatibility bucket already used by
`listEntriesByDay`. No historical day is relabelled. Nothing backfills
`people.consumed_time_zone`.

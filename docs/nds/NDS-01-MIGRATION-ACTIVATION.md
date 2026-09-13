# NDS Integrity v1 — migration activation and rollback

Packet `FD-PLATFORM-NDS-01`, branch `fix/nds-integrity-v1`.

## Status: NOT APPLIED

None of these files has been run against any database — not production, not
staging, not a preview project. The packet that authored them holds
`database_read: false` and `database_write: false`, and its forbidden scope
explicitly covers remote DDL and migrations *including staging*. No local
PostgreSQL server was available either (`initdb` reports
`program "postgres" is needed by initdb but was not found`; the installed libpq
ships client tools only, the Docker daemon is not running, and the Supabase CLI
is not installed), so even a disposable local apply could not be performed.

Treat every statement below as reviewed-but-unexecuted. The verification step
`nds-local-database-integrity` is reported **BLOCKED / NOT RUN** for this reason,
and the NDS defect must not be described as operationally repaired until these
files are applied and the checks pass.

This repository has no `supabase/migrations/` directory. Schema changes are
hand-run camelCase `.sql` files under `scripts/sql/`, executed in the Supabase
SQL Editor, which is the convention these files follow.

## Files

| Order | File | Phase |
| --- | --- | --- |
| 1 | `scripts/sql/ndsIntegrityV1_01_dayRevisions.sql` | expand |
| 2 | `scripts/sql/ndsIntegrityV1_02_resolverAndWorker.sql` | expand |
| 3 | `scripts/sql/ndsIntegrityV1_03_contract.sql` | contract |
| — | `scripts/sql/ndsIntegrityV1_99_rollback.sql` | rollback |

A static contract test (`lib/nds/__tests__/ndsIntegrityV1MigrationContract.test.ts`)
guards the properties these files depend on, so a later edit that weakens the
publication guard, the lease fencing, or the RLS posture fails the suite. It is
not a substitute for running them.

## Activation order

Both expand steps are additive. Nothing in them drops a table or column,
rewrites a journal row, or backfills history, so they are safe to apply before
the application that uses them is deployed.

1. **Apply step 01.** Adds `nds_consumed_day(payload, occurred_at)`,
   `journal_day_revisions`, the transactional revision trigger,
   `people.consumed_time_zone`, and the RLS/grant posture. From this moment
   revisions begin advancing for new journal mutations. Nothing reads them yet.
2. **Apply step 02.** Adds the `daily_nds` validity columns, the computation
   generation fence, `nds_read_day_snapshot`, `nds_publish_daily_score`, and the
   `nds_recompute_work` queue with its claim/complete/fail RPCs. The legacy
   `nds_recompute_queue` trigger keeps running alongside the new one.
3. **Deploy the application.** Until this point cached scores carry
   `source_revision IS NULL`, which the resolver treats as **invalid**. Those
   days recompute on read. They are deliberately not grandfathered: a stored
   score whose source cannot be verified is exactly the failure mode this work
   exists to remove.
4. **Verify.** Confirm `nds_work_diagnostics()` shows work being claimed and
   completed, that `daily_nds.source_revision` is populated on newly computed
   days, and that no browser role holds `EXECUTE` on a privileged function
   (the verification queries at the end of each file check this).
5. **Apply step 03 last**, and only once the new worker is demonstrably draining
   work. It aborts with an exception if the legacy queue still has
   `pending`/`processing` rows, so a premature run is refused rather than
   silently dropping outstanding recomputes.

### Why the generation fence must be bumped on a computation change

`nds_computation_generation.generation` is what stops an older still-running
deployment from overwriting a newer computation context at the same source
revision. Any change to the formula, classifier, normalizer, or day policy
version must increment it in the same release:

```sql
UPDATE public.nds_computation_generation
   SET generation = generation + 1,
       nds_version = '<new>', classifier_version = '<new>',
       normalizer_version = '<new>', day_policy_version = '<new>',
       updated_at = NOW()
 WHERE id;
```

Comparing version strings lexicographically or trusting completion timestamps
would not work: neither gives a total order across concurrently deployed
instances. That is why this is a database-enforced integer.

## Rollback order

**Roll back the application first.** Because expand is additive, the pre-v1 code
ignores the new columns, tables, and triggers entirely, so an application
rollback on its own is already a safe resting state. Schema rollback is a
separate, rarely-needed step.

1. Roll back the application deployment.
2. If step 03 was applied, restore the legacy enqueue path by re-running
   `scripts/sql/createDailyNDSTables.sql` (its section 3 recreates
   `enqueue_nds_recompute` and its trigger idempotently). Do this **before**
   detaching the new triggers, so no window exists in which neither path records
   a change.
3. Run sections 1–2 of `scripts/sql/ndsIntegrityV1_99_rollback.sql` to detach
   `trigger_nds_request_work` and `trigger_nds_track_journal_day_revision`. The
   schema is now inert: the new objects exist and nothing writes to them. **Stop
   here** in almost all cases.
4. Only if the objects must actually be removed, uncomment section 3. It is
   commented out by default because dropping `journal_day_revisions` discards
   recorded revisions, and dropping the `daily_nds` columns discards persisted
   readings, provenance, and coverage.

## What consumed-day metadata does and does not change

`payload.consumed_day` is authored server-side and is **absent** on every entry
written before this contract, and on any write where the subject's timezone is
unknown (`people.consumed_time_zone IS NULL` and no self-declared request zone).

Absence routes reads to a labelled deterministic **UTC compatibility bucket**,
which is the same selection `listEntriesByDay` already performs. That is why no
historical day is relabelled and no history is rewritten: legacy rows keep
resolving to the day the Log has always shown them on, so the Log and the score
continue to agree. The bucket is not a claim about the original local day, and it
is reported as such through `daily_nds.day_provenance` rather than presented as a
verified local day.

Nothing in these migrations backfills `people.consumed_time_zone`. Until a
subject has a stored zone, or logs from a browser that declares one, their new
entries also fall in the compatibility bucket. This is deliberate: stamping a
guessed zone onto a permanent record is worse than recording that it is unknown.

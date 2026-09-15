# NDS Integrity v1 — activation, cutover, and rollback (NDS-01A)

**Superseded for operators.** Use `docs/nds/NDS-01C-MIGRATION-ACTIVATION.md`.
NDS-01C adds step 05 between expand and cutover: `01 → 02 → 05 → 03 → 04`.
This file is the NDS-01A historical record. **No remote DB application has occurred.**

Packet `FD-PLATFORM-NDS-01A`, branch `fix/nds-integrity-v1`.

## Status

**Local rehearsal only.** Steps 01, 02, 03, 04, and 99 were applied and rolled
back against run-owned disposable local PostgreSQL clusters started by
`test/localdb`. They have **not** been applied to production, staging, or any
connected project.

## Files

| Order | File | Phase |
| --- | --- | --- |
| 1 | `scripts/sql/ndsIntegrityV1_01_dayRevisions.sql` | expand |
| 2 | `scripts/sql/ndsIntegrityV1_02_resolverAndWorker.sql` | expand |
| 3 | `scripts/sql/ndsIntegrityV1_03_legacyCutover.sql` | transfer ledger |
| 4 | `scripts/sql/ndsIntegrityV1_04_contract.sql` | contract |
| — | `scripts/sql/ndsIntegrityV1_99_rollback.sql` | rollback |

## Cutover (replaces “drain via the new worker”)

1. Expand 01 + 02. Old enqueue trigger remains attached.
2. Apply 03. `nds_transfer_legacy_queue()` copies outstanding legacy identities
   into `nds_recompute_work` and writes `nds_legacy_transfer_ledger`. Legacy
   status is **not** rewritten to completed.
3. Repeat the transfer until `transferred = 0` on a quiet boundary. Concurrent
   journal writes keep requesting new work; they are not lost.
4. Stop old enqueue/writer activity, then run 04. `nds_assert_ready_to_contract()`
   refuses if the legacy enqueue trigger is still attached or untransferred
   pending/processing rows remain.
5. “Transferred” is not “recomputed”. The new worker must actually publish.

## Rollback

Detach new writers first (`ndsIntegrityV1_99_rollback.sql` non-destructive
steps). Destructive drops stay commented. Rolling back application code must not
treat leftover v1 metadata as an old-writer success.

## Local-only rehearsal evidence

See `docs/nds/evidence/nds01a/`.

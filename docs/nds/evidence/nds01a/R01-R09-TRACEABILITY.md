# NDS-01A R01–R09 traceability

Starting head: `2399d50bd32ded2e5ecca3cf51cc0bd4e39b9ea6`.
Packet: `FD-PLATFORM-NDS-01A`.

| ID | Counterexample | Correction | Passing evidence | Remaining |
| --- | --- | --- | --- | --- |
| R01 | Inactive Home cache reused; `@self` shared across accounts; journal list effect was the write boundary | Auth-epoch cache key; dirty inactive entries; `notifyNdsConsumptionCommitted` on journalService; `_app` bind + lifecycle | `ndsDayStore.test.ts`, `useNDS.composition.test.tsx` | Authenticated browser Home→leave→commit→Home still required |
| R02 | Chicago 21:30 UTC Sep 13 vs local Sep 12; metadata not checked against `occurred_at` | `attributeConsumedDay` rejects mismatched instants; Log `listEntriesByDay` uses scan window + same membership | `nds01aCorrections.test.ts`, `dayIdentity.test.ts` | Live API composition against local auth fixture |
| R03 | Work trigger ran before revision trigger | One trigger: bump then `nds_after_day_revision_bump` | `npm run test:localdb` R03 | None for SQL path |
| R04 | Cache hit left work outstanding; claimed vs verified revision | Completion records verified revision+generation; already-current completes | `test:localdb` R04; worker TS | None for SQL path |
| R05 | Old build adopts generation integer; missing guard; legacy upsert | Context-bound publish; revision-zero guard; writer fence | `test:localdb` R05 | None for SQL path |
| R06 | Live catalog unversioned; one multiplier for snapshot and catalog | Distinct snapshot vs catalog servings; untrusted catalog added sugar | `nds01aCorrections.test.ts` R06 | Writer snapshot capture is still lineage-on-read for new grouped writes; full server stamp of food evidence is incomplete |
| R07 | `sugarG` → `added_sugar_g`; partial sugar became fresh | Grounding no longer maps total sugar; partial/unknown sugar is `insufficient_data` | `nds01aCorrections.test.ts` R07; grounding test | Founder rollout policy still open |
| R08 | Cache zero-fill; stale empty settled | Persist coverage; no zero-fill; refused empty is `updating` | resolver + state changes; localdb non-numeric publish | Full API 503/debug matrix not run in browser |
| R09 | “Drain via new worker” could not terminate | Executable `nds_transfer_legacy_queue` + ledger + contract assert + rollback detach | `test:localdb` R09 including rollback-without-history-loss | Not applied remotely |

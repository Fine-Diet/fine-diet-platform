# NDS-01B local activation notes

LOCAL APPLICATION ONLY. These files were not applied to any connected or remote database.

Expand order for a disposable local cluster:

1. `ndsIntegrityV1_01_dayRevisions.sql`
2. `ndsIntegrityV1_02_resolverAndWorker.sql` (current computation identity seed + explicit grants)
3. `ndsIntegrityV1_05_identityAndGrants.sql` (upgrade alignment + `nds_assert_generation_matches_source`)
4. `ndsIntegrityV1_03_legacyCutover.sql` when rehearsing transfer
5. `ndsIntegrityV1_04_contract.sql` only after cutover succeeds
6. `ndsIntegrityV1_99_rollback.sql` invalidates repaired caches before releasing the writer fence

Operator role: `nds_operator` may call `nds_advance_generation`.
Server role: `service_role` may resolve, publish, and process work.
Browser roles `anon` / `authenticated` have no execute on those functions.

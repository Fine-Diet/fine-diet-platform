# NDS-01B A01–A08 closure matrix

Starting head: `8cf04ce64dd1fe90caa1a1dd7d991b23904ba9ae`
Packet: `FD-PLATFORM-NDS-01B`
Parent run: `1986efab-c200-4edc-a892-02ad61447e50`

| ID | Old counterexample | Path | Test | Baseline at 8cf04ce | Fix | Remaining |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | TS v2 vs SQL v1 seed | `computationIdentity.ts`, step 02/05 | `nds01bCorrections` A01; localdb A01 | App publish would be `stale_context` on fresh v1 seed | One identity tuple; upgrade advances generation | Composed resolver-on-PostgREST still BLOCKED_NOT_RUN |
| A02 | `nds_advance_generation` omitted from revoke | step 02 grants; localdb A02 | localdb restricted roles | PUBLIC execute default | Revoke PUBLIC/browser; grant operator/server | No local Auth JWT API matrix |
| A03 | `commitNutritionDraft` silent; move origin omitted | `journalService.ts` | `nds01bCorrections` A03 | Draft commit did not notify | Notify after draft; conservative invalidate on timestamp move | Authenticated API writers BLOCKED_NOT_RUN |
| A04 | Auth epoch not subscribed | `ndsDayStore.ts`, `useNDS.ts` | `useNDS.composition` account change | Mounted hook kept old epoch | `useSyncExternalStore` on auth and Today | Real browser account-change BLOCKED_NOT_RUN |
| A05 | Lineage-on-read; cup guessed as servings | `consumedEvidence.ts`, journal write, `convert.ts` | `nds01bCorrections` A05 | Unknown cup became servings | Write-time snapshot; refuse unknown household at write | Live catalog version tokens not exhaustive |
| A06 | Parent `added_sugar_g` promoted over untrusted children | `normalizeConsumedEntry.ts` | `nds01bCorrections` A06 | Derived parent total scored as known | Authored parent only; else component combine | Historical snapshots stay conservative |
| A07 | Publish exception settled empty; newer_result completed without reread | `resolveDailyNDS.ts`, worker | `resolveDailyNDS.test` retained; worker identity | Exception could return settled non-score | `storage_unavailable` / previous updating; reread required | Production adapter on PostgREST BLOCKED_NOT_RUN |
| A08 | Rollback dropped fence while cache stayed valid | step 99 | localdb rollback | Old writer could keep v1 metadata | Invalidate under publishing flag, then bump generation, then drop fence | Remote rehearsal forbidden |

Credited NDS-01A closures are retained and not reopened.

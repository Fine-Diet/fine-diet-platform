# NDS-01A evidence manifest

Packet `FD-PLATFORM-NDS-01A`. Starting head
`2399d50bd32ded2e5ecca3cf51cc0bd4e39b9ea6`. Execution model: Cursor Grok 4.6,
profile `cursor-code-executor`, registered sender `cursor-sonnet-executor`.

## Local target

Guarded disposable cluster identity is in `local-cluster-identity.log`.
Observed run `nds01a_a4be825c6afca3be`:

- PostgreSQL 17.10 from `@embedded-postgres/darwin-arm64@17.10.0-beta.17`
- `pg@8.23.0`
- unix socket only; `listen_addresses=''`
- run marker present; data directory user-owned and mode-private
- destroyed after the probe (`dataDirectoryExists=false`)

Hostname `localhost` is rejected by `inspectLocalTarget`. Docker was
unavailable. Supabase CLI was absent. Playwright CLI 1.49.1 was present;
Chromium binary was absent. `NDS01A_LOCAL_APP_URL` was unset. No local
Auth or PostgREST fixture existed.

## Artifact hashes

Computed 2026-09-13T15:18:22Z before this file was written.

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| docs/nds/evidence/nds01a/R01-R09-TRACEABILITY.md | 2408 | 316b5ba03675eb6b8cfa9b517fa3545231545b0ef0991254556bef028aeda53b |
| docs/nds/evidence/nds01a/READER-WRITER-MAP.md | 2450 | e832ed667d385a9452e38f4efccb45d4a56850b39c0f45ef4fafee2692a6e002 |
| docs/nds/evidence/nds01a/capability-probe.log | 960 | 232969220462124a1401d722b541381281fe1e28c082e8d8e4cbb4abba4d9aeb |
| docs/nds/evidence/nds01a/cp0-localdb-failing-first.log | 10888 | 95d8172d7f2539604c4653311c6a5785154377a7f4f97ca467ab625a14e0826f |
| docs/nds/evidence/nds01a/local-cluster-identity.log | 3605 | 58ff18e8d69cabe94f9ee81e80499bc654ba6a52f7b068a4d8b3dd3cdd33a234 |
| docs/nds/evidence/nds01a/localdb-integrity.log | 2120 | f9f3765ee3deba04440b5edb975f0db83489e0e9fd87f864c0e90218a9a8d526 |
| docs/nds/evidence/nds01a/nds-targeted-jest.log | 35634 | 9cf7f09bf584646e20f9e829488efc97af59b7ee689d451da79cabbe1bcb9f1a |
| docs/nds/evidence/nds01a/next-build.log | 59249 | 43a2af8ee0d712a30500ff4ae5ceedaa6741a8433c30c5e377f37ec675d21f13 |
| docs/nds/evidence/nds01a/npm-test-full.log | 243371 | c0f17c818824d25e2d7083662c576bbfeea3559761aa934ecd7b18cc35df3104 |
| docs/nds/evidence/nds01a/verify-entitlements.log | 2422 | 4a2f9e79df5d20124dba77798c83de0db04d8d019d94d752928d09fc516c7307 |

## Raw command outcomes

| Command | Exit | Reading |
| --- | ---: | --- |
| `npm run test:localdb -- --verbose` | 0 | 18 passed |
| `npx jest --no-coverage` (full) | 1 | 403 passed / 1 failed / 3833 tests. Failure is pre-existing `lib/plans/planRepeat/__tests__/policy.test.ts` |
| targeted NDS Jest | 0 | 16 suites / 377 passed |
| `npx next build` | 0 | after excluding `test/` from app compilation |
| `npm run verify:entitlements` | 0 | recorded in verify-entitlements.log |
| Playwright browser scenarios | not run | Chromium missing; no local app/auth URL |
| Authenticated local API composition | not run | no local Auth/PostgREST |

Unrelated untracked file `public/audio/Test-Print-For-FD.mp3` was left
untouched and uncommitted.

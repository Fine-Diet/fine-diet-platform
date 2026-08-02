# Package 6 — Durable Elapsed Completion + Restart Correctness

## Branch / base

- **Branch:** `feat/programs-integration-contract-v1`
- **Exact base:** `648bd4d6a93c3e27f371a92cb9132196d1a3f886`
- **Bridge authorization:** `7ffaf496-4a90-4298-84b2-bdf9d456ca54`
- **Thread:** `FD-PLATFORM:operational-readiness-package-6-v1`
- **Prior audit report:** `38342c8d-3d49-45b2-a7bb-c02b7cf7f020`
- **Audit document:** `3e59e841-78d4-4766-840e-bbbbd369d8a0`
- **Evidence SHA (functional):** `964bb3c0254398b3721ab101cfccab50487336b2`
- **READY Vercel preview:** pending branch deploy after push

## Scope shipped

Durable end-of-duration completion and restart correctness only:

1. Keep `resolveEnrollmentStatus` pure (no DB writes).
2. Add server-owned `reconcileElapsedOpenEnrollment` that idempotently persists `status=completed` + `completed_at` for open enrollments whose resolved status is completed because `current_day > duration_days`.
3. Guard reconcile updates by enrollment id, person id, and open stored statuses (`pre_start` / `active` / `paused`).
4. Preserve existing `completed_at` when present.
5. Wire reconciliation into active-enrollment lookup, runtime summary reads, and lifecycle entry so availability/library/detail/enroll cannot disagree after a server path touches the row.
6. Restart: after reconciling an elapsed open row, enrollment creation continues and selects the latest published version when no explicit version is supplied.
7. Reject explicitly supplied draft/archived versions with `PROGRAM_VERSION_NOT_PUBLISHED`.
8. Preserve pause / resume / cancel / explicit complete transition rules and unique-open-enrollment race handling.

## Files changed

- `lib/programs/programRuntimeServerService.ts`
- `lib/programs/__tests__/programRuntimeServerService.test.ts`
- `lib/programs/__tests__/programLifecycle.test.ts`
- `docs/package-6-execution-report.md`
- `docs/package-6-founder-qa.md`

## Out of scope (held)

- delivery-module version-lock correction
- completion_policy schema
- recommendation apply/dismiss/supersede
- Program → Plan / Profile / Meal / Home writes
- Home presentation overlay / resolver merge
- `program_series` migrations
- production data repair (including the two live overdue enrollments)
- PR, merge, force-push, or production deploy

## Verification

| Check | Result |
|---|---|
| Focused Jest (`programRuntimeServerService`, `programLifecycle`, `programAvailability`) | Pass |
| Targeted non-test `tsc --noEmit` | Clean for package source (pre-existing Jest typedef noise in `*.test.ts` only) |
| `npm run build` | Pass |
| Live overdue enrollment mutation | Not performed |

## Safe-failure behavior

- Concurrent reconcile: update is conditional on open statuses; zero-row winner path re-reads the current row.
- Explicit unpublished `programVersionId`: rejected before insert.
- In-window active / future pre-start / paused / cancelled / already-completed rows: not auto-completed by reconcile.
- Unique constraint race on create: still returns the raced open enrollment after reconcile check.

## Stop state

`needs_review`

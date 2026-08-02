# Package 6 — Founder QA (Elapsed Completion + Restart)

Use the READY preview / branch pin listed in `docs/package-6-execution-report.md`.

**Do not** manually complete or SQL-repair the two known live overdue enrollments as part of this QA. Reconciliation is exercised through normal server reads/enroll on isolated test accounts or by observing service behavior after deploy of this branch only.

## Preconditions

- Clean QA person with `program:baseline` entitlement
- No open Baseline enrollment (or only fixture/test rows you own)
- Prefer an isolated test enrollment you create for this pass

## Steps

1. Create a Baseline enrollment with `selected_start_date` far enough in the past that `current_day > duration_days` (21 for Baseline), **or** use a service/fixture path that already has such a row in a non-production sandbox.
2. Call `GET /api/journal/programs/runtime-summary` (or open `/app/programs` / `/app/programs/baseline`).
3. Confirm the enrollment now stores `status=completed` and a non-null `completed_at` after the first server path touches it.
4. Confirm availability/library show completed and `can_start` when entitled + runtime-ready.
5. `POST /api/journal/programs/enroll` for Baseline again with a fresh start date.
6. Confirm a **new** enrollment row is created on the latest published Baseline version (not a return of the completed row).
7. Smoke pause → resume → cancel on a separate in-window enrollment; confirm each still works.
8. Explicit lifecycle `complete` on an in-window active enrollment still persists completed + `completed_at`.
9. If an API client can supply `programVersionId`, confirm draft/archived ids are rejected.

## Pass criteria

- Elapsed open rows become durable completed exactly once when a server path encounters them
- Restart creates a new enrollment on latest published
- No production overdue-row hand repair performed
- Pause / resume / cancel / explicit complete unchanged for legal states

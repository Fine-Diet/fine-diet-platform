# Package 2 — Onboarding state machine

Canonical metadata on `people.metadata`:

| Field | Meaning |
|---|---|
| `onboarding_started_at` | User began the flow |
| `onboarding_last_step` | Zero-based page index for resume |
| `onboarding_skipped_at` | Explicit skip; app entry allowed; resumable |
| `onboarding_completed_at` | Required setup completed |
| `onboarding_restarted_at` | Optional restart marker |
| `onboarding` | Progress/answers blob (`answers`, etc.) |

## Transitions

```text
not_started
  → (start / progress) → in_progress
  → (skip) → skipped
  → (complete) → completed

in_progress
  → (progress) → in_progress
  → (skip) → skipped
  → (complete) → completed

skipped
  → (resume? + complete) → completed
  → app entry allowed; Finish Setup offered

completed
  → terminal for gate purposes
```

## Writers

- **Allowed:** `/api/onboarding/persist` (`started` | `progress` | `skip` | `complete`)
- **Forbidden:** generic `POST /api/journal/profile` writing `onboarding_completed_at` or `onboarding_skipped_at`
- **Removed:** Profile page auto-completion writer

## Gate

Middleware uses `mustEnterOnboarding(metadata)`:

- completed OR skipped → may enter `/app`
- otherwise → `/app/onboarding?returnTo=...`

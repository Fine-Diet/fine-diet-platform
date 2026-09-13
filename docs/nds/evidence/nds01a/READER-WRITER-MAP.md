# NDS-01A actual reader / writer map

Recorded against working tree on `fix/nds-integrity-v1` after R01–R09
corrections. This is the live path, not the superseded client calculator.

## Actual-consumption writers

These persist a journal intake (or delete one). NDS invalidation now happens
on the **client journalService boundary**, not from a journal list effect.

| Path | How it writes | Invalidation |
| --- | --- | --- |
| `lib/journal/journalService.ts` `createEntry` | `POST /api/journal/entries` → `journalServerService` | `notifyNdsConsumptionCommitted` after success |
| `lib/journal/journalService.ts` `updateEntry` | `PATCH /api/journal/entries/[id]` | same |
| `lib/journal/journalService.ts` `updateGroupedMealInstance` | grouped update API | same |
| `lib/journal/journalService.ts` `deleteEntry` | delete API | same; empty date list forces a full dirty pass |
| Composer / grouped / draft / plan-execution loggers | call `createEntry` or their own API that still lands in `journalServerService` | inherit the journalService notify when they go through it |

Server write boundary: `lib/journal/journalServerService.ts` stamps
`consumed_day` and discards any client-supplied membership. It does **not**
yet return `affected_days` as an atomic response field.

## Score readers

| Surface | Source |
| --- | --- |
| `pages/journal.tsx` | `useNDS` → `ndsDayStore` → `GET /api/journal/nds` |
| `pages/journal/home.tsx` | same |
| `pages/journal/insights.tsx` | same |
| `components/app/home/AppHomeView.tsx` | same |
| Home rail / scroller adapters | consume hook state / projected legacy data |

No page owns a private NDS fetch. `lib/nds/ndsServerService.ts` remains
superseded dead code.

## Auth / lifecycle

`pages/_app.tsx` binds `bindNdsAuthContext` on `SIGNED_OUT`, `SIGNED_IN`, and
`USER_UPDATED`. Token refresh does not increment the epoch unless the auth
user id changed. `lib/nds/ndsClientLifecycle.ts` revalidates on visibility,
online, storage, and local-midnight.

Cache key: `{sessionEpoch}|{canonicalPerson}|{dateLocal}`. The auth user id
is used only to detect an account switch, not as `people.id`.

## Not closed on this run

- Server responses still do not return `affected_days` atomically.
- Authenticated local API composition and browser Home→Log→Home were
  **not run** (no local Auth/PostgREST fixture; Chromium binary absent).
- Writer nutrient snapshots remain lineage-on-read for catalog foods.

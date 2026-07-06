# Forced Result Preview (QA Harness)

Packet P adds an **admin/dev-only** QA harness that force-renders a Gut Check
results pack for a given level (`level1`–`level4`) on demand — without writing
a submission, running scoring, or triggering email / webhook / claim /
saved-account / analytics side effects. It exists so QA can visually verify
every Gut Check outcome (copy, results pack rendering, CTA labels, video
resolution, result layout stability, outcome mapping assumptions) before we
use this system to prove repeatability with a second assessment.

This is a QA harness, **not** a user-facing feature, **not** a scoring
override, and **not** a path to activate a second assessment.

## Route

```
GET /admin/assessments/gut-check/preview?forceOutcome=level1
GET /admin/assessments/gut-check/preview?forceOutcome=level2
GET /admin/assessments/gut-check/preview?forceOutcome=level3
GET /admin/assessments/gut-check/preview?forceOutcome=level4
```

With no `forceOutcome` (or an invalid one) the route renders a safe level
selector + error — never a forced payload for an unknown level.

## Gating / safety

- **Admin/dev-only.** `getServerSideProps` in
  `pages/admin/assessments/gut-check/preview.tsx` checks the SSR user role
  via `getCurrentUserWithRoleFromSSR`; only `editor` and `admin` may view.
  Anyone else gets the unauthorized panel (same pattern as
  `pages/admin/assessments/index.tsx`). The route lives under `/admin/...`
  so existing admin nav conventions apply, and it emits
  `<meta name="robots" content="noindex, nofollow" />`.
- **Not public.** `forceOutcome` is intentionally **not** accepted by
  `/assessments/gut-check` or `/assessments/gut-check/start`. The public
  assessment flow has no `forceOutcome` handling and cannot be coerced into
  a forced render.
- **Server-side validation.** `forceOutcome` is validated server-side via
  `buildForcedGutCheckPreviewResult` (see below). Invalid / missing values
  render a safe selector + error and never reach the preview component.

## How it renders

The route validates `forceOutcome` and passes a `ForcedGutCheckPreviewResult`
to `components/admin/assessments/ForcedResultPreview.tsx`, which:

1. Fetches the **same published results pack** the real `ResultsScreen`
   fetches (`GET /api/results-packs/resolve?assessmentType=gut-check&resultsVersion=v2&levelId=<level>`),
   with **no `submissionId`** and **no pack-ref pinning**. The resolve API is
   read-only and returns pack content only.
2. Resolves the 3-page flow content with the **same pure resolver** the real
   screen uses — `resolveResultsScreenContent(pack, levelId)` — so QA sees
   the actual copy, CTA labels, and resolved video URL production would
   render for that level.
3. Renders the pages **read-only** with a clearly-marked QA banner and a
   level selector. The email capture, PDF download, claim/login,
   saved-to-account banner, and analytics tracking that live in
   `ResultsScreen` are **intentionally omitted** — they require a real
   submission and must never fire from a forced preview. Where the real
   screen would render those slots, the forced preview shows small QA
   markers (e.g. `emailHelper` / `pdfHelper` copy, the method CTA URL) so
   the copy is still visible without the side effect.

## The forced-preview helper

`lib/assessments/results/forcedPreview.ts` exports a pure, testable helper:

```ts
buildForcedGutCheckPreviewResult(levelId: string): ForcedGutCheckPreviewOutcome
```

- Returns `{ ok: true, result }` for `level1`–`level4` with a deterministic,
  preview-only `ForcedGutCheckPreviewResult` (`assessmentType: 'gut-check'`,
  `primaryAvatar: <level>`, `isForcedPreview: true`, `submissionId: null`,
  `sessionId: null`, stub `scoreMap`).
- Returns `{ ok: false, error }` for any other value:
  - empty / non-string → `invalid-input`
  - unknown level id → `invalid-level`

What the helper is **not**:
- **Not a scoring adapter.** It does not call `calculateScoring` or
  `dispatchScoring`. The `scoreMap` is a deterministic stub for display.
- **Not an outcome mapper.** It does not call `mapAssessmentOutcome` and
  does not produce an `OutcomeMappingResult`.
- **Not an outcome builder UI.**
- **Not a second-assessment path.** It is Gut Check-only; a future assessment
  must add its own explicit forced-preview support before it can be QA'd
  this way (see below).

Tests live in `lib/assessments/__tests__/forcedPreview.test.ts`.

## What it does NOT do

- Does **not** write a submission (no POST to `/api/assessments/submit`).
- Does **not** run scoring (no `calculateScoring` / `dispatchScoring` call).
- Does **not** trigger emails, webhooks, claim flows, saved-account flows, or
  real analytics events that imply a user submission.
- Does **not** pin a results pack ref (no POST to
  `/api/assessments/update-pack-ref`) — there is no submission to pin to.
- Does **not** change Gut Check scoring math or the normal Gut Check
  user-facing happy path.
- Does **not** create, register, route, persist, publish, or activate a
  second assessment.

## Relationship to scoring adapter + outcome mapper activation

Forced preview is a **separate** QA surface from the two activation gates a
second assessment must satisfy (see
[adding a new assessment](./adding-a-new-assessment.md) → "Activation
requires BOTH a scoring adapter and an outcome mapper"). A future assessment
that wants forced-preview QA must add its own:

1. A forced-preview helper scoped to its `assessmentType` and outcome shape
   (do not reuse `buildForcedGutCheckPreviewResult` — it is Gut Check-only).
2. An admin route under `/admin/assessments/<slug>/preview` reusing the same
   gating pattern.
3. Its own results pack resolution path (the resolve API already keys off
   `assessmentType`).

Until a future assessment adds all three, it has no forced-preview support —
by design. **Packet Q** added Baseline Readiness support:

```
GET /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low
GET /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-building
GET /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-ready
```

Helper: `buildForcedBaselineReadinessPreviewResult` in
[`lib/assessments/results/forcedPreviewBaselineReadiness.ts`](../../lib/assessments/results/forcedPreviewBaselineReadiness.ts).
Component: `ForcedBaselineReadinessPreview`. Hub:
`/admin/assessments/baseline-readiness`.

Missing CMS results packs at `v1-internal` show a safe error — expected until
admin publishes packs.

Forced preview is not an activation step; it is a QA tool that
runs **after** a scoring adapter and outcome mapper exist and **before** the
assessment is taken live. For the end-to-end admin publish + forced-preview QA
checklist, see the
[CMS publish runbook](./baseline-readiness-cms-publish-runbook.md).

## What remains before building a second assessment

- ~~Baseline Readiness forced-preview helper + admin route.~~ Done (Packet Q).
- ~~Repo draft specs for CMS question set + result packs.~~ Done (Packet R) —
  see [`baseline-readiness-cms-question-set.md`](./baseline-readiness-cms-question-set.md)
  and [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md).
- **Manual CMS publish** of question set v1 + three result packs at
  `v1-internal` (specs are repo-only until entered in Supabase).
- QA forced preview after CMS publish (should load packs instead of missing-pack error).
- Public launch of Baseline Readiness (registry `active` — engineering only).

Packet P does **not** create or publish a second assessment, does not add a
public route for any planned concept, and does not persist forced-preview
state to the DB. Packet Q adds Baseline Readiness forced preview as an
admin-only internal proof surface.

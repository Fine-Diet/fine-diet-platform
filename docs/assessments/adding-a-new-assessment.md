# Adding a New Assessment

The assessment system is registry-driven: a single canonical route
(`/assessments/[slug]`) and runner (`/assessments/[slug]/start`) resolve every
assessment from `ASSESSMENT_REGISTRY` + the CMS. Gut Check is the first
registered record. This doc is the step-by-step for adding a **second**
assessment, plus the known Gut Check coupling that must be resolved when the
second assessment needs its own scoring or results template.

## No-code path (CMS-only assessment)

Use this when the new assessment reuses the standard question → results flow
and the Gut Check v2/v3 scoring engine is acceptable (see "Known coupling"
below before assuming this).

1. **Register the assessment.** Add a record to `ASSESSMENT_REGISTRY` in
   [`lib/assessments/assessmentRegistry.ts`](../../lib/assessments/assessmentRegistry.ts):
   - unique `slug` and `assessmentType` (the registry invariant throws in dev
     on duplicates)
   - `defaultVersion`, `status: 'active'`, `canonicalPath: '/assessments/<slug>'`
   - `hasFileFallback: false` (file fallback is Gut Check only; future
     assessments are CMS-only)
   - `role` optional
2. **Publish a question set in the CMS.** Create a `question_sets` row for the
   new `assessmentType` + version, then publish a `question_set_revisions`
   row and set the `published_revision_id` on `question_set_pointers`.
   - If the assessment scores into a different avatar/level set than
     `level1`–`level4`, include an `avatars` array in the question set JSON.
     `questionSetToAssessmentConfig` reads it; omitting it falls back to the
     Gut Check `level1`–`level4` default.
3. **Publish a results pack in the CMS.** Create a `results_packs` row per
   level + a `results_pack_revisions` row, set the published pointer. Use the
   Flow v2 `flow.page1/2/3` structure so the results screen renders your copy
   (the legacy fallback page3 copy is Gut Check-specific — see "Known
   coupling").
4. **Cover config (optional).** Add a record to `ASSESSMENT_COVER_CONFIGS` in
   [`lib/assessments/coverConfig.ts`](../../lib/assessments/coverConfig.ts)
   for a branded cover. Omit it and the resolver generates a generic cover
   from the registry entry.
5. **Verify.** Visit `/assessments/<slug>` (cover) and
   `/assessments/<slug>/start` (runner). The collection page at
   `/assessments` lists it automatically via `listActiveAssessments`.

No route, runner, or provider code changes are required.

## Declare an operations contract (Packet I)

Every assessment should also declare an operations contract in
[`lib/assessments/operationsContract.ts`](../../lib/assessments/operationsContract.ts).
The contract is pure metadata — scoring adapter id/style, expected option value
model, result levels, output artifact statuses (screen/email/PDF/webhook/claim/share),
preview strategy, and publish-readiness requirements. It is rendered on
`/admin/assessments` so admins can verify scoring/result alignment, preview
coverage, and downstream artifacts without reading code.

To add a contract for a new assessment, add a record to `OPERATIONS_CONTRACTS`
keyed by `assessmentType`. Use honest `ArtifactStatus` values
(`implemented` / `external` / `not-implemented` / `manual-review`) — never
inflate. The readiness evaluator (`evaluateReadiness`) maps automated checks
from a `ReadinessInput`; info-only checks report `manual-review` until a human
confirms. A normalized result payload contract lives in
[`lib/assessments/resultArtifactPayload.ts`](../../lib/assessments/resultArtifactPayload.ts)
for future screen/email/PDF/webhook alignment.

## Wire outcome mapping (Packet N)

Every assessment that produces a user-facing outcome (level / persona / flags
/ recommendation-set) must register an outcome mapper at
[`lib/assessments/outcomes/`](../../lib/assessments/outcomes/) — see
[`docs/assessments/outcome-mapping.md`](./outcome-mapping.md). The dispatcher
routes by `assessmentType` and fails closed for unknown types, mirroring the
scoring dispatch safety model. Gut Check's `level1`–`level4` mapping is the
only live mapper today; a second assessment must register its own mapper
before it can produce an outcome, and must never inherit Gut Check's level
mapping.

## Code-required path (custom scoring or results template)

The v2/v3 scoring engine and the results-screen legacy fallback are Gut Check
specific. If the new assessment needs its own scoring or a different results
template, see "Known coupling" and plan a dedicated packet.

## Preview / version behavior (free, inherited)

- `?v=<n>` overrides `defaultVersion`; out-of-bounds/invalid values fall back
  to `entry.defaultVersion` (`parseVersionFromQuery`).
- `?preview=1` is honored only for `editor`/`admin` roles via the shared
  `canPreview` helper in
  [`lib/assessments/previewAccess.ts`](../../lib/assessments/previewAccess.ts).
  The cover route carries `v` and `preview=1` forward to the start route via
  `buildAssessmentStartQuery`; `submission_id` is dropped so the cover CTA
  always starts a clean runner flow. Preview runs use an isolated session id,
  never write a submission, and render `PreviewResults` in-memory.
- Preview URLs get `noindex, nofollow`.

## Known Gut Check coupling to resolve when building assessment #2

These are intentionally **out of scope** for the Packet F hardening pass and
are documented here so the work is discoverable. Each is behavior-preserving
for Gut Check today but would leak Gut Check semantics into a second
assessment.

### 1. Scoring engine is version-keyed, not assessment-keyed

[`lib/assessmentScoring.ts`](../../lib/assessmentScoring.ts) dispatches by
`config.assessmentVersion` (2 → `calculateScoringV2`, 3 → `calculateScoringV3`).
[`lib/assessmentScoringV2.ts`](../../lib/assessmentScoringV2.ts) hardcodes the
Gut Check q1–q17 axis map, the level1–level4 decision tree, and calls
`getAssessmentConfig('gut-check', …)` for thresholds. A second assessment with
`assessmentVersion: 2` would accidentally be scored by the Gut Check axis
engine.

**Resolution (Packet M + Packet N, live):** an `assessmentType`-keyed
scoring dispatch layer now exists at
[`lib/assessments/scoring/`](../../lib/assessments/scoring/) — see
[`docs/assessments/scoring-dispatch.md`](./scoring-dispatch.md). It routes by
`assessmentType` and fails closed for unknown types. The Gut Check adapter
wraps `calculateScoring` and is the only registered adapter today. As of
Packet N the **runtime is wired through dispatch** via
`scoreAssessmentRun` (`lib/assessments/scoring/runtimeScore.ts`):
`AssessmentProvider` no longer calls `calculateScoring` directly. Dispatch
failures fail closed (`state.scoringError`) and block submission; they never
fall back to `calculateScoring`. `calculateScoring` remains only as the Gut
Check adapter's internal implementation detail. A second assessment must
register its own adapter before it can be scored, and its own outcome mapper
(see below) before it can produce a user-facing outcome.

### 2. Results-screen legacy fallback page3 copy is Gut Check copy

[`lib/assessments/results/resolveResultsScreenContent.ts`](../../lib/assessments/results/resolveResultsScreenContent.ts)
renders hardcoded Gut Check page3 copy ("Most gut advice ignores patterns like
this.", "The Fine Diet Method" bullets, etc.) when a results pack lacks Flow v2
structure. A second assessment shipping a legacy-shape pack would inherit Gut
Check marketing copy.

**Resolution when needed:** branch `resolveResultsScreenContent` by
`assessmentType` (or a pack `schemaVersion`), with each assessment owning its
own legacy fallback. Flow v2 packs are already assessment-agnostic, so
prefer shipping Flow v2 packs for the new assessment to sidestep this.

### 3. File fallbacks are Gut Check-scoped (already isolated)

- [`lib/assessments/questions/loadQuestionSet.ts`](../../lib/assessments/questions/loadQuestionSet.ts)
  only loads `gut-check` v2 from the bundled JSON; returns `null` for any other
  type (gated by `entry.hasFileFallback` in the resolver).
- [`lib/assessments/results/loadResultsPack.ts`](../../lib/assessments/results/loadResultsPack.ts)
  only loads `gut-check` results packs; returns `null` for any other type.
- [`lib/assessments/results/getLevelSpecificVideo.ts`](../../lib/assessments/results/getLevelSpecificVideo.ts)
  maps `level1`–`level4` to `/gut-pattern-breakdown?level=N` (Gut Check only).

These are intentionally Gut Check-scoped and gated; future assessments are
CMS-only and should not add file fallbacks. No change needed unless a future
assessment wants a bundled fallback (add a registry-gated branch then).

### 4. `getAssessmentConfig` legacy helper

[`lib/assessmentConfig.ts`](../../lib/assessmentConfig.ts) `getAssessmentConfig`
has a `case 'gut-check'` only (default throws). It is marked `@deprecated`; new
code uses `resolveQuestionSet` + `questionSetToAssessmentConfig`. The runner's
client-side fallback is isolated in
[`lib/assessments/legacyClientFallback.ts`](../../lib/assessments/legacyClientFallback.ts)
and only returns the Gut Check v1 placeholder for `gut-check` v1.

## Test surface to extend when adding assessment #2

- `lib/assessments/__tests__/assessmentRegistry.test.ts` — add the new record
  to the active-list / slug-resolution expectations.
- Add a `loadResultsPack` no-leak case for the new type (returns null from the
  file fallback) until a CMS pack is published.
- If a custom scoring engine is introduced, add a registry test confirming the
  new assessment routes to its own engine, not Gut Check's.

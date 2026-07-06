# Scoring Dispatch

Packet M introduces a safe assessment-type scoring dispatch foundation that
preserves Gut Check scoring exactly while making it possible to wire future
assessment types / scoring templates deliberately — never accidentally.

This doc explains:

- how the current runtime scores a completed run,
- what the dispatch layer adds and why,
- how future assessments should wire scoring dispatch,
- how scoring adapter / template ids relate to the operations contract and
  factory metadata,
- what remains before building a second assessment,
- why unknown types fail closed.

## Current runtime scoring (inventory)

A completed Gut Check run flows through these layers today:

1. **Answer collection** — `AssessmentProvider`
   (`components/assessments/AssessmentProvider.tsx`) collects `Answer[]`
   (`{ questionId, optionId }`) as the user advances.
2. **Option values** — v1 options carry `scoreWeights` (avatar-weighted); v2/v3
   options carry an explicit `value` ∈ {0,1,2,3}. The provider converts
   answers to a `responses` map (`{ q1: 0, q2: 1, … q17: 3 }`) for v2+.
3. **Score calculation** — `AssessmentProvider` calls
   `calculateScoring(answers, config)` in
   [`lib/assessmentScoring.ts`](../../lib/assessmentScoring.ts), which routes
   by `config.assessmentVersion`:
   - version 2 → `calculateScoringV2` (axis engine, `QUESTION_AXIS_MAP`)
   - version 3 → `calculateScoringV3` (axis engine, `QUESTION_AXIS_MAP_V3`,
     q8 reverse correction)
   - else → v1 weighted-avatar normalization
4. **Result level / profile derivation** — v2/v3 produce `primary_level`
   (`level1`–`level4`) via a decision tree over five axis bands (capacity,
   buffer, responsiveness, recovery, protection). v1 produces a
   `primaryAvatar` from the normalized score map.
5. **Submission payload** — `AssessmentProvider` builds the payload
   (`scoreMap`, `normalizedScoreMap`, `primaryAvatar`, `secondaryAvatar`,
   `confidenceScore`, `secondaryModifier`, `confidenceLabel`, `responses`)
   and POSTs to `/api/assessments/submit`.
6. **Results screen routing** — the browser redirects to
   `/assessments/${assessmentType}?submission_id=${submissionId}`, which
   renders `ResultsScreen` (DB-driven).
7. **Preview mode** — when `isPreview`, the provider never POSTs and never
   redirects; `AssessmentRunner` renders `PreviewResults` from in-memory
   scoring state.
8. **Artifact payload dependencies** — `resultArtifactPayload`
   (`lib/assessments/resultArtifactPayload.ts`) reads
   `submission.primary_avatar`, `submission.normalized_score_map`,
   `submission.metadata.secondary_modifier`, and
   `submission.metadata.confidence_label` to build the canonical payload
   consumed by ResultsScreen, the n8n email workflow, the PDF route, and the
   webhook outbox.

### Version-keyed scoring assumptions (the unsafe part)

`calculateScoring` routes by `assessmentVersion`, not `assessmentType`. A
second assessment shipping with `assessmentVersion: 2` would silently inherit
Gut Check's axis engine — including the hardcoded q1–q17 axis map, the
level1–level4 decision tree, and `getAssessmentConfig('gut-check', …)`
threshold lookups. `lib/assessmentScoringV2.ts` is Gut Check-specific end to
end.

### Gut Check-specific scoring paths

- `QUESTION_AXIS_MAP` / `QUESTION_AXIS_MAP_V3` (q1–q17 → axis mapping).
- `determineLevel` (axis bands → `level1`–`level4` decision tree).
- `determineModifier` (axis bands → `high_responsiveness` / `poor_recovery` /
  `narrow_buffer`).
- `calculateConfidence` (q16/q17 variance → high/moderate/low).
- `getAssessmentConfig('gut-check', version)` threshold lookup.

### Result-level assumptions

`primary_avatar` on the submission row is a `level1`–`level4` id for Gut
Check. Downstream consumers (ResultsScreen, results packs, PDF, email) assume
that level set.

### Downstream payload dependencies

The four consumers (screen / email / PDF / webhook) all key off
`primary_avatar` + the metadata extras. See
`lib/assessments/resultArtifactPayload.ts` `RESULT_PAYLOAD_COVERAGE` for the
field-by-field coverage map.

## The dispatch layer

New module: [`lib/assessments/scoring/`](../../lib/assessments/scoring/)

- `types.ts` — `AssessmentScoringInput`, `AssessmentScoringOutput`,
  `AssessmentScoringAdapter`, `ScoringDispatchResult`, `ScoringDispatchError`,
  `ScoringAdapterId`, `ScoringTemplateId`.
- `gutCheckAdapter.ts` — wraps the existing `calculateScoring` engine behind
  the `AssessmentScoringAdapter` contract.
- `scoringDispatch.ts` — `dispatchScoring(input)` routes by `assessmentType`
  to a registered adapter, with fail-closed guards.
- `index.ts` — public re-exports.

### Why route by `assessmentType`, not `assessmentVersion`

Routing by `assessmentVersion` is what made the legacy engine leak Gut Check
semantics into any future assessment that happened to pick version 2 or 3.
The dispatch layer routes by `assessmentType` first; the version is only used
_inside_ an adapter (the Gut Check adapter still delegates to
`calculateScoring`, which routes by version internally — unchanged).

### Fail-closed contract

`dispatchScoring` returns a `ScoringDispatchResult` discriminator and never
throws scoring errors to the caller:

| Failure | `error.kind` |
| --- | --- |
| Unknown / unregistered `assessmentType` | `unknown-assessment-type` |
| `adapterId` does not match the resolved adapter | `adapter-id-mismatch` |
| `scoringTemplateId` does not match the adapter's template | `scoring-template-mismatch` |
| Adapter throws | `adapter-throw` |
| Missing `assessmentType` / `answers` / `config` | `invalid-input` |

A future assessment must NEVER silently fall back to Gut Check scoring. Two
adapters are registered today: Gut Check (`gut-check`) and Baseline Readiness
internal proof (`baseline-readiness`).

### Gut Check adapter behavior

The Gut Check adapter:

- delegates to `calculateScoring(answers, config)` — no rewrite, no remapping
  of the math,
- reports `adapterId` based on the engine actually used:
  - v3 → `gut-check-axis-v3`
  - v2 → `gut-check-axis-v2`
  - else → `gut-check-weighted-v1`
- reports `scoringTemplateId`:
  - v2+ → `axis-scores-to-profile`
  - v1 → `weighted-avatar-normalization` (legacy, not in factory metadata)
- returns an `AssessmentScoringOutput` that is a strict superset of the legacy
  `ScoringResult` shape, so the current ResultsScreen, submission payload,
  artifact payload, and preview flow can consume it without reshaping,
- refuses to score a non-Gut-Check `assessmentType` even if invoked directly.

### Baseline Readiness adapter behavior (Packet Q — provisional internal proof)

[`lib/assessments/scoring/baselineReadinessAdapter.ts`](../../lib/assessments/scoring/baselineReadinessAdapter.ts):

- **Does not** call `calculateScoring` or reuse Gut Check axis math.
- Implements factory template `total-score-to-levels` provisionally: sums 0–3
  option values, maps total to `readiness-low` / `readiness-building` /
  `readiness-ready` via fixed ratio thresholds (≤33%, ≤66%, >66% of max).
- Adapter id: `baseline-readiness-total-score-v1-provisional`.
- Fail-closed on empty/partial answers, unknown question/option ids, or wrong
  `assessmentType`.
- Registry status remains `draft` — scoring is reachable from the admin fixture
  runner and tests, not from the public `/assessments/baseline-readiness` route.

## Runtime wiring status (Packet N — live)

The dispatch layer is the **canonical and live** scoring entry point as of
Packet N. The runtime (`AssessmentProvider`) no longer calls
`calculateScoring` directly; it calls `scoreAssessmentRun` in
[`lib/assessments/scoring/runtimeScore.ts`](../../lib/assessments/scoring/runtimeScore.ts),
which delegates to `dispatchScoring` and projects the adapter output back into
the legacy `ScoringResult` shape the reducer / submission payload / preview
already consume.

`calculateScoring` remains in the tree **only** as the Gut Check adapter's
internal implementation detail (`gutCheckAdapter.score` calls it). It is no
longer reachable from the runtime except through the dispatch layer.

### The runtime wrapper

`scoreAssessmentRun({ assessmentType, assessmentVersion, answers, config, preview })`
returns a discriminated `RuntimeScoreOutcome`:

- `{ ok: true, scoringResult, adapterId, scoringTemplateId }` — projected
  `ScoringResult` (parity with the legacy `calculateScoring` return for
  Gut Check, asserted in `lib/assessments/__tests__/runtimeScore.test.ts`).
- `{ ok: false, error }` — fail-closed. The runtime records a `scoringError`
  on `AssessmentState`, clears partial scoring, and **blocks submission**.
  It never falls back to `calculateScoring`.

### How the provider handles dispatch results

In `components/assessments/AssessmentProvider.tsx`:

- On `ok: true` → `dispatch({ type: 'CALCULATE_SCORES', scoringResult })`
  (unchanged reducer path) + `trackAssessmentCompleted`.
- On `ok: false` → `dispatch({ type: 'SCORING_FAILED', error })`. The
  `SCORING_FAILED` reducer clears `primaryAvatar` / `scoreMap` /
  `confidenceScore` / modifier / label and sets `state.scoringError`.
  `submitAssessment` and the auto-submit effect both read `scoringError` and
  refuse to submit when it is set. The scoring effect also short-circuits
  while `scoringError` is set so it does not retry on every render.
- On a non-scoring throw from the wrapper (programming bug) → the catch
  branch dispatches `SCORING_FAILED` with `kind: 'runtime-error'`. Still
  fail-closed; never falls back.

Gut Check scoring does not fail in normal operation, so user-facing scoring,
results, email, webhook, saved-account, claim, CTA, and preview behavior are
unchanged. The fail-closed path exists for safety, not for Gut Check's
day-to-day flow.

### Failure lifecycle + recovery (Packet O hardening)

`scoringError` is **fail-closed and never silent**, but it is also not a
permanent trap. The lifecycle is:

- **Set** only by `SCORING_FAILED` (a dispatch failure or a non-scoring throw
  from the wrapper). Partial scoring state is cleared so no unsafe payload can
  be submitted.
- **Blocks submission** while set: both `submitAssessment` (manual) and the
  auto-submit effect read `scoringError` and refuse. Preview never writes a
  submission regardless.
- **Surfaced** in the runner: `AssessmentRunner` renders `ErrorState` when
  `scoringError` is set, so the user/operator has explicit signal that scoring
  failed — it never degrades to an empty results screen.
- **Cleared only by a deliberate recovery event**, never by a re-render:
  - `SELECT_OPTION` (an answer change) clears `scoringError`. After the
    answer change, the scoring effect re-runs once the run is back in a
    completed + fully-answered state. This is the in-flow recovery path: go
    back, change an answer, and scoring re-evaluates with the new inputs.
  - `INIT` (a full session reset / remount, e.g. reloading the page) clears
    `scoringError` and all scoring state.
- **Not cleared by step navigation alone** (`NEXT_QUESTION` / `PREVIOUS_QUESTION`)
  and not cleared by the auto-submit effect. There is no retry loop and no
  timer-based retry; scoring only re-runs when the user actually changes an
  input or fully restarts.

This keeps the safety contract (fail-closed, submission blocked) while giving
the user a real recovery path after a one-off dispatch failure. The Gut Check
happy path is unchanged because `scoringError` is never set in normal
operation.

### Projection parity (Gut Check)

`scoreAssessmentRun` projects these `AssessmentScoringOutput` fields into the
legacy `ScoringResult`, and parity is asserted against `calculateScoring` for
the v3 P1 (level1) and P5 (level4) personas and for v2:

- `scoreMap`
- `normalizedScoreMap`
- `primaryAvatar`
- `secondaryAvatar`
- `confidenceScore`
- `secondaryModifier`
- `confidenceLabel`

`responses` (the `{ q1: 0, … q17: 3 }` map) is still derived by
`convertAnswersToResponsesMap` inside the provider, unchanged — it is not part
of the scoring output and is not re-derived by the wrapper.

## How future assessments should wire scoring dispatch

1. **Implement an adapter.** Create
   `lib/assessments/scoring/<type>Adapter.ts` implementing
   `AssessmentScoringAdapter` for that `assessmentType`. The adapter owns its
   own scoring math (do not reuse Gut Check's axis map or level decision tree
   unless the assessment genuinely shares that model).
2. **Register it.** Add the adapter to `ADAPTER_REGISTRY` in
   `lib/assessments/scoring/scoringDispatch.ts`. Until you do,
   `dispatchScoring` fails closed for that `assessmentType` — by design.
3. **Declare a scoring template** in
   `lib/assessments/assessmentFactory.ts` (`SCORING_TEMPLATES`) if the
   template is new, and set its `status` to `'available'` only once the
   adapter is wired. Until then it stays `'planned'`.
4. **Declare an operations contract** in
   `lib/assessments/operationsContract.ts` with the live `scoringAdapterId`
   and `factoryModel.scoringTemplateId`.
5. **Register the assessment** in `lib/assessments/assessmentRegistry.ts`
   (identity only — slug, version, status).
6. **Publish question set + results packs** in the CMS.
7. **Wire the runtime** to `dispatchScoring` (see the next wiring step above)
   so the new assessment can be scored through the same safe entry point.

## How ids relate to the operations contract + factory metadata

- **`ScoringAdapterId`** (e.g. `gut-check-axis-v3`) — the live engine id.
  Declared on `OperationsContract.scoringAdapterId` and realized in
  `lib/assessments/scoring/<type>Adapter.ts`. Legacy adapters are listed in
  `OperationsContract.legacyScoringAdapters` for visibility only.
- **`ScoringTemplateId`** (e.g. `axis-scores-to-profile`) — the reusable
  "how answers become a result" descriptor. Declared in
  `assessmentFactory.ts` `SCORING_TEMPLATES` and referenced by the adapter's
  `scoringTemplateId` field and by
  `OperationsContract.factoryModel.scoringTemplateId`.
- The factory metadata (`assessmentFactory.ts`) is metadata-only and honest:
  a template's `status` is `'available'` only when a real adapter is wired.
  Today only `axis-scores-to-profile` is `available` (Gut Check).

## What remains before building a second assessment

- ~~Rewire `AssessmentProvider` to `dispatchScoring` and confirm parity.~~
  Done in Packet N — see "Runtime wiring status (Packet N — live)".
- ~~Outcome mapping foundation.~~ Done in Packet N — see
  [`docs/assessments/outcome-mapping.md`](./outcome-mapping.md). Gut Check
  level mapping is the only live mapper; persona / flag / recommendation-set
  shapes are modeled but not live.
- ~~Forced-result preview.~~ Done in Packet P — see
  [`docs/assessments/forced-result-preview.md`](./forced-result-preview.md).
  Admin/dev-only QA harness that force-renders each Gut Check level
  (level1–level4) without writing a submission.
- ~~A second assessment's scoring adapter.~~ Done in Packet Q for Baseline
  Readiness (`baselineReadinessAdapter.ts`) — provisional internal proof only.
- A second assessment's outcome mapper, operations contract, registry entry,
  CMS question set, and results packs — **partially done** for Baseline Readiness
  (mapper + contract + draft registry; CMS packs still missing).
- Public launch of Baseline Readiness (registry `status: 'active'`, downstream
  artifacts, product-final scoring).

Packet M does **not** create or publish a second assessment, does not add a
public route for any planned concept, and does not persist planned assessment
drafts or scoring rules to the DB.

## Why unknown types fail closed

A silent fallback to Gut Check scoring for an unknown assessment type would
produce a `level1`–`level4` result with Gut Check's axis semantics, which
would then flow into Gut Check-shaped results packs, emails, PDFs, and
webhooks. That is a correctness and safety bug, not a graceful degradation.
The dispatch layer therefore rejects unknown types before any scoring math
runs, with an internal-safe error that names the missing assessmentType and
points at the registry file to fix.

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

A future assessment must NEVER silently fall back to Gut Check scoring. The
only adapter registered today is the Gut Check adapter, scoped to
`assessmentType: 'gut-check'`.

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

## Runtime wiring status (Packet M)

The dispatch layer is added as the canonical scoring entry point. The
runtime (`AssessmentProvider`) still calls `calculateScoring` directly today.
This packet deliberately does **not** rewire the runtime, to guarantee Gut
Check user-facing scoring, results, emails, webhook, saved-account, claim,
and CTA behavior do not change.

### Exact next wiring step (deferred to a follow-up packet)

1. In `components/assessments/AssessmentProvider.tsx`, replace the
   `calculateScoring(state.answers, config)` call with:

   ```ts
   const dispatchResult = await dispatchScoring({
     assessmentType: config.assessmentType,
     assessmentVersion: config.assessmentVersion,
     answers: state.answers,
     config,
     preview: isPreview,
   });
   if (!dispatchResult.ok) {
     // handle fail-closed (log + fallback to empty scores, mirroring today's
     // existing catch branch)
   }
   const scoringResult = dispatchResult.output;
   ```

2. Map `AssessmentScoringOutput` → the reducer's `ScoringResult` shape (a
   strict subset of the output — every legacy field is present).
3. Keep `convertAnswersToResponsesMap` for the submission `responses` field.
4. Add a parity test that asserts the rewired provider produces the same
   `primaryAvatar` / `scoreMap` / `confidenceScore` as today for the P1 and
   P5 personas.
5. Once parity is green, the runtime no longer imports `calculateScoring`
   directly; the dispatch layer becomes the only entry point.

This is left to a follow-up so Packet M stays a safe, additive foundation.

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

- Rewire `AssessmentProvider` to `dispatchScoring` (the next wiring step
  above) and confirm parity.
- Outcome mapping foundation: a generalized way to map a scoring output
  (`levelId` / `persona` / `flags` / `recommendation-set`) to a results pack
  and downstream CTA, without reusing Gut Check's level1–level4 results
  copy resolver.
- Forced-result preview (render a specific outcome on demand) so a second
  assessment can be QA'd without taking it live.
- A second assessment's scoring adapter, operations contract, registry
  entry, CMS question set, and results packs.

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

# Outcome Mapping

Packet N introduces a pure, data-shaped outcome mapping foundation that
describes how a *scored* assessment run maps to a user-facing **outcome** —
the thing the results screen, email, PDF, webhook, and CTA route from. It
layers on top of the [scoring dispatch](./scoring-dispatch.md) layer and
mirrors its safety model: route by `assessmentType`, fail closed for unknown
types, never let a future assessment silently inherit Gut Check's mapping.

This doc explains:

- what the outcome mapping layer adds and why,
- the outcome shapes it models (only `level` is live today),
- how Gut Check's level mapping is represented explicitly,
- how future assessments should wire outcome mapping,
- what remains before building a second assessment,
- why unknown types fail closed.

## Why an outcome mapping layer

Scoring dispatch produces a normalized `AssessmentScoringOutput`. Downstream
consumers (results screen, email, PDF, webhook, CTA) need a stable *outcome*
to route on. For Gut Check that outcome is a level (`level1`–`level4`), which
today is carried on `submission.primary_avatar`. A future assessment will
produce a different outcome shape — a persona, a set of risk flags, or a set
of recommendations — and routing those by reusing Gut Check's level machinery
would be the same class of bug the scoring dispatch layer fixes for the
engine: a future assessment silently inheriting Gut Check semantics.

The outcome mapping layer routes by `assessmentType` to a registered
`OutcomeMapper`, so a future assessment must register its own mapper before
it can produce an outcome at all.

## The outcome mapping layer

New module: [`lib/assessments/outcomes/`](../../lib/assessments/outcomes/)

- `types.ts` — `OutcomeShape`, `LevelOutcome` / `PersonaOutcome` /
  `FlagOutcome` / `RecommendationSetOutcome`, `OutcomeMappingResult`
  (discriminated union), `OutcomeMappingInput`, `OutcomeMappingError`,
  `OutcomeMapper`.
- `gutCheckLevelMapping.ts` — the only live mapper. Maps a Gut Check
  scoring output to its `level1`–`level4` outcome, resolving the level
  label + summary from the Gut Check operations contract.
- `outcomeMapping.ts` — `mapAssessmentOutcome(input)` routes by
  `assessmentType` to a registered mapper, with fail-closed guards. Also
  exports `getOutcomeMapper`, `listOutcomeMappers`, and
  `MODELED_OUTCOME_SHAPES_NOT_LIVE`.
- `index.ts` — public re-exports.

### Outcome shapes

| Shape | Result variant | Status |
| --- | --- | --- |
| `level` | `LevelOutcome { shape, levelId, label?, summary? }` | **live** (Gut Check) |
| `persona` | `PersonaOutcome { shape, personaId, label? }` | modeled, not live |
| `flag` | `FlagOutcome { shape, flags[] }` | modeled, not live |
| `recommendation-set` | `RecommendationSetOutcome { shape, recommendationIds[] }` | modeled, not live |

The modeled-but-not-live shapes exist in the `OutcomeMappingResult` union and
in `MODELED_OUTCOME_SHAPES_NOT_LIVE` so the type system and the admin surface
can show they are designed-but-not-built. No mapper is registered for them
today, so `mapAssessmentOutcome` would fail closed for any assessment that
declared one of those shapes until a mapper is wired.

### Fail-closed contract

`mapAssessmentOutcome` returns an `OutcomeMappingOutcome` discriminator and
never silently degrades:

| Failure | `error.kind` |
| --- | --- |
| Unknown / unregistered `assessmentType` | `unknown-assessment-type` |
| Missing `assessmentType` / `scoringOutput` | `invalid-input` |

A future assessment must NEVER silently fall back to Gut Check's level
mapping. The only mapper registered today is the Gut Check level mapper,
scoped to `assessmentType: 'gut-check'`.

Mappers are required to be pure and synchronous. A mapper throw is treated
as a programming bug (not a runtime condition to silently degrade from), so
`mapAssessmentOutcome` does not catch mapper throws — it lets them surface
so they get fixed.

### Gut Check level mapping behavior

`mapGutCheckLevelOutcome`:

- reads the level id from `scoringOutput.primaryAvatar` (Gut Check's scoring
  output carries the level there, matching the `primary_avatar` column on
  the submission row),
- resolves the level's display label + summary from the Gut Check operations
  contract's `resultLevels` descriptor (`lib/assessments/operationsContract.ts`),
- returns a `LevelOutcome` carrying the level id + the descriptor metadata.

It does **not** resolve results *copy*. Results copy continues to be resolved
from the CMS results pack by the existing `ResultsScreen` pipeline,
unchanged. This mapper only carries the canonical level id and the
contract's label/summary pointers — it is not a results-copy resolver and is
not a UI builder.

## How future assessments should wire outcome mapping

1. **Implement a mapper.** Create
   `lib/assessments/outcomes/<type>Mapping.ts` implementing `OutcomeMapper`
   for that `assessmentType` and `OutcomeShape`. The mapper owns its own
   mapping logic (do not reuse Gut Check's level mapping unless the
   assessment genuinely produces a level band).
2. **Register it.** Add the mapper to `OUTCOME_MAPPERS` in
   `lib/assessments/outcomes/outcomeMapping.ts`. Until you do,
   `mapAssessmentOutcome` fails closed for that `assessmentType` — by
   design.
3. **Keep it pure.** Mappers read scoring output + (optionally) the
   operations contract. No I/O, no side effects, no UI.
4. **Do not invent a shape.** If the assessment produces a shape not in
   `OutcomeShape` today, extend the union in `types.ts` first, then add the
   mapper. Do not overload an existing shape.

## What remains before building a second assessment

- A second assessment's scoring adapter (see
  [scoring dispatch](./scoring-dispatch.md)).
- A second assessment's outcome mapper (this layer).
- Forced-result preview (render a specific outcome on demand) so a second
  assessment can be QA'd without taking it live.
- A second assessment's operations contract, registry entry, CMS question
  set, and results packs.

Packet N does **not** create or publish a second assessment, does not add a
public route for any planned concept, and does not persist outcome mapping
rules to the DB.

## Why unknown types fail closed

A silent fallback to Gut Check's level mapping for an unknown assessment type
would attach a `level1`–`level4` outcome to that assessment's scoring output,
which would then flow into Gut Check-shaped results packs, emails, PDFs, and
webhooks. That is a correctness and safety bug, not graceful degradation.
The outcome mapping layer therefore rejects unknown types before any mapping
runs, with an internal-safe error that names the missing `assessmentType`
and points at the registry file to fix.

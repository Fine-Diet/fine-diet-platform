# Assessment Factory Readiness (Packet J)

Fine Diet is building toward an **assessment factory**: a platform for authoring
many prospect-facing assessment tools across Fine Diet problem points, built from
reusable **archetypes** and **scoring templates**, following a shared **creation
workflow**. Gut Check is the first registered assessment — one *instance* of the
factory model, not the whole product.

This packet adds the code-owned metadata layer and an honest admin readiness
surface. It does **not** publish a second assessment, build a generalized
scoring-rule engine, or build an outcome builder UI. Every capability is
labelled honestly: `available`, `planned`, `manual-review`, or `not-implemented`.

## Where the metadata lives

- [`lib/assessments/assessmentFactory.ts`](../../lib/assessments/assessmentFactory.ts) —
  pure, code-owned, testable metadata: problem-point taxonomy, archetypes,
  scoring templates, creation workflow stages, factory model resolution, and an
  integrity validator.
- [`lib/assessments/operationsContract.ts`](../../lib/assessments/operationsContract.ts) —
  each assessment's contract now carries an optional `factoryModel`
  (`problemPointId`, `archetypeId`, `scoringTemplateId`). Gut Check declares
  `gut-health` / `axis-profile` / `axis-scores-to-profile`.
- [`components/admin/operationsContract/AssessmentFactoryHub.tsx`](../../components/admin/operationsContract/AssessmentFactoryHub.tsx) —
  presentational surface rendered on `/admin/assessments`.

## Problem-point taxonomy

Grounded in the program catalogue (`lib/programs/programSeriesCatalogue.ts`) so
assessments route into real Fine Diet pathways instead of inventing new product
surface area. Status shows whether an assessment is available for the problem
point today.

| Problem point | Status | Suggested archetypes | Suggested templates |
| --- | --- | --- | --- |
| `gut-health` | available | axis-profile, habit-audit | axis-scores-to-profile, total-score-to-levels |
| `protein-sufficiency` | planned | habit-audit, score-band | total-score-to-levels, category-tally-to-persona |
| `sugar-stability` | planned | habit-audit, score-band | total-score-to-levels, category-tally-to-persona |
| `inflammation-recovery` | planned | axis-profile, score-band | axis-scores-to-profile, total-score-to-levels |
| `food-sensitivity` | planned | recommendation-routing, risk-triage | recommendation-routing, threshold-risk-flags |
| `body-composition` | planned | readiness-audit, score-band | total-score-to-levels, threshold-risk-flags |
| `baseline-readiness` | planned | readiness-audit, habit-audit | total-score-to-levels, threshold-risk-flags |
| `training-recovery` | planned | habit-audit, axis-profile | total-score-to-levels, axis-scores-to-profile |
| `program-fit` | planned | program-fit, recommendation-routing | recommendation-routing, category-tally-to-persona |

## Assessment archetypes

Reusable assessment shapes, independent of problem point. Only `axis-profile`
is `available` today (Gut Check is the reference instance). All others are
`planned` — wiring a non-Gut-Check archetype still requires engineering.

- `score-band` — total score → level bands
- `axis-profile` — multi-axis scores → profile/level (Gut Check)
- `persona-category` — category tally → persona
- `readiness-audit` — criteria → ready / needs-work / not-ready
- `risk-triage` — threshold flags → triage band (not a diagnosis)
- `habit-audit` — frequency audit → pattern snapshot
- `recommendation-routing` — answer pattern → recommendation set
- `program-fit` — prospect signals → Fine Diet program / offer
- `progress-checkin` — delta vs baseline → progress band

## Scoring templates

Metadata only. This is **not** a generalized scoring-rule engine. Only
`axis-scores-to-profile` is `available` (Gut Check). A scoring-template selector
is `planned`, not built.

- `total-score-to-levels` (level-bands) — planned
- `axis-scores-to-profile` (axis-profile) — available
- `category-tally-to-persona` (persona) — planned
- `threshold-risk-flags` (risk-flags) — planned
- `recommendation-routing` (recommendation-set) — planned
- `hybrid-score-and-flags` (level-bands) — planned
- `progress-delta` (progress-band) — not-implemented

Each archetype lists its compatible templates and each template lists its
applicable archetypes; the integrity validator enforces that the two sides agree.

## Creation workflow

The intended path from a problem point to a published assessment. Each stage is
labelled honestly.

1. **Choose a problem point** — available (taxonomy is code-owned metadata)
2. **Choose an archetype** — available (archetypes are code-owned metadata; wiring a new one still needs engineering)
3. **Choose a scoring template** — planned (selector + generalized engine not built)
4. **Author questions** — available (`/admin/question-sets/author`, Packet H)
5. **Map outcomes** — planned (outcome builder UI not built)
6. **Preview artifacts** — manual-review (preview exists for Gut Check; forced-result preview not implemented)
7. **Publish readiness** — available (`/admin/assessments`, Packet I checklist)

## How Fine Diet should create a new prospect assessment today

Today there is exactly one fully supported path, and it still requires an
engineer for anything that is not a Gut Check clone:

1. **Decide the problem point + archetype + scoring template.** Use the factory
   metadata on `/admin/assessments` as the planning vocabulary. If the
   archetype is not `axis-profile` (Gut Check's), stop — engineering is
   required first (see "Gaps" below).
2. **Register the assessment** in `ASSESSMENT_REGISTRY`
   ([`lib/assessments/assessmentRegistry.ts`](../../lib/assessments/assessmentRegistry.ts))
   with a unique slug, `status: 'active'`, `hasFileFallback: false`.
3. **Declare an operations contract** in `OPERATIONS_CONTRACTS`
   ([`lib/assessments/operationsContract.ts`](../../lib/assessments/operationsContract.ts)),
   including a `factoryModel` (`problemPointId`, `archetypeId`,
   `scoringTemplateId`). Use honest `ArtifactStatus` values.
4. **Author the question set** in the CMS via
   `/admin/question-sets/author` (Packet H). The v2 schema assumes 4
   options/question with values 0–3, which fits score-band and axis-profile
   templates.
5. **Author results packs** in the CMS via `/admin/results-packs`. Prefer
   Flow v2 packs to avoid inheriting Gut Check legacy copy (see
   [adding-a-new-assessment.md](./adding-a-new-assessment.md) "Known coupling").
6. **Verify publish readiness** on `/admin/assessments` (Packet I checklist).
7. **Publish** the question-set and results-pack pointers (admin only).

## What is code-owned today vs admin-authored today

| Capability | Owner |
| --- | --- |
| Problem-point taxonomy, archetypes, scoring templates | Code (`assessmentFactory.ts`) |
| Assessment registry identity (slug, version, status) | Code (`assessmentRegistry.ts`) |
| Operations contract + scoring adapter id | Code (`operationsContract.ts`) |
| Scoring engine implementation | Code (`assessmentScoringV2.ts`) |
| Question set content (questions, options, values) | Admin-authored in CMS |
| Results pack content (copy, channels, flow) | Admin-authored in CMS |
| Publish pointers | Admin (admin role only) |
| Outcome mapping (level → CTA / program / offer) | Admin-authored in CMS, but a generalized outcome builder UI is not built |

## Gaps before a non-engineer can publish an arbitrary assessment

These are intentionally out of scope for Packet J and are the candidates for
Packet K:

1. **Assessment-type-keyed scoring dispatch.** `lib/assessmentScoring.ts`
   dispatches by `assessmentVersion`, not `assessmentType`. A second assessment
   with `assessmentVersion: 2` would accidentally be scored by the Gut Check
   axis engine. (Documented in
   [adding-a-new-assessment.md](./adding-a-new-assessment.md).)
2. **Scoring-template selector + generalized scoring-rule engine.** Templates
   are metadata only. There is no admin UI to pick a template and have the
   runtime apply it without engineering.
3. **Outcome builder UI.** Mapping a result level / persona / recommendation
   to a CTA, program, or offer is manual via results packs today; non-level
   outcomes (persona, recommendation-set) have no authoring UI.
4. **Forced-result preview harness.** Rendering a specific outcome on demand
   (without taking the assessment) is not implemented. This is the recommended
   pre-build step before a second assessment.
5. **PDF / email / CTA / program-routing configuration per assessment.** Today
   these are Gut Check-shaped. A second assessment with different downstream
   outputs needs per-assessment configuration.
6. **Governance checks.** Non-diagnostic claim guardrails and medical-claim
   review for non-Gut-Check problem points (e.g. `risk-triage`,
   `food-sensitivity`) are not formalized.

## Guardrails respected by this packet

- No second assessment is created or published.
- No final public assessment branding or medical claims are invented.
- No generalized scoring-rule engine is built.
- No outcome builder UI is built.
- No PDF generator is built.
- Gut Check scoring / runtime / results / email / webhook / claim behavior is unchanged.
- Legacy admin / question-set routes are preserved.
- No destructive migrations.

## Recommended Packet K

Two viable next steps; pick one based on product priority:

- **K1 — Build a real second assessment** on the `score-band` archetype +
  `total-score-to-levels` template for the `baseline-readiness` problem point
  (lowest-scoring-risk archetype, reuses the existing 4-option/value-0–3
  schema). Requires assessment-type-keyed scoring dispatch first.
- **K2 — Build the scoring-template selector + forced-result preview harness**
  so the factory can support a second archetype without bespoke engineering
  per assessment.

K1 delivers a visible second assessment faster; K2 advances the factory
mechanism that makes assessment #3, #4, … cheap. Recommended: **K1** with the
scoring-dispatch decoupling done as its first sub-step, because it forces the
factory model to prove itself against a real second instance.

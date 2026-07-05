# Assessment Creation Manual (Packet K)

This is the plain-English operating guide for the Fine Diet assessment
creation system. It answers the question an admin lands on `/admin/assessments`
with: **"Where do I create, edit, or activate an assessment today?"**

It is honest about what an admin can do now vs what still requires
engineering. Nothing here implies a non-engineer can publish an arbitrary
assessment today.

## Where assessments live today

| Surface | What it is | Who owns it |
| --- | --- | --- |
| `/admin/question-sets/author` | Structured question-set authoring UI (Packet H) | Admin-authored content |
| `/admin/question-sets` | Question-set list, revisions, preview, publish | Admin |
| `/admin/results-packs` | Results-pack content, revisions, preview, publish | Admin-authored content |
| `/admin/assessments` | Factory model, operations contract, readiness checklist, creation-system maturity (Packets I, J, K) | Admin read + engineering code |
| `lib/assessments/assessmentRegistry.ts` | Live assessment identity (slug, version, status) | Engineering (code-owned) |
| `lib/assessments/operationsContract.ts` | Per-assessment operations contract + factory coordinates | Engineering (code-owned) |
| `lib/assessments/assessmentFactory.ts` | Problem-point taxonomy, archetypes, scoring templates, creation workflow | Engineering (code-owned metadata) |
| `lib/assessments/assessmentCreationPlan.ts` | Planned assessment concepts, ownership split, activation checklist | Engineering (code-owned metadata) |

## How to edit an existing assessment today

Today the only fully supported path is editing Gut Check and its results
packs. This is admin-owned and requires no engineering.

1. Open `/admin/question-sets/author` and pick the Gut Check question set.
2. Edit sections, questions, options, and option values. The v2 schema
   assumes 4 options/question with values 0–3.
3. Preview the question set and publish a new revision when ready.
4. Open `/admin/results-packs` to edit results pack copy, channels, and flow.
   Prefer Flow v2 packs to avoid inheriting Gut Check legacy copy (see
   `adding-a-new-assessment.md` "Known coupling").
5. Confirm publish-readiness on `/admin/assessments` (Packet I checklist).

Gut Check scoring, runtime, results, email, PDF, webhook, and claim behavior
are **not** changed by any of this. Do not alter the operations contract
scoring adapter or the scoring engine.

## How to plan a new assessment today

New assessments start as a **planning/scaffold workflow**, not a live
assessment. The vocabulary lives in the factory metadata:

1. **Choose a problem point** from the taxonomy on `/admin/assessments`
   (e.g. `baseline-readiness`, `program-fit`, `gut-health`).
2. **Choose an archetype** (e.g. `score-band`, `readiness-audit`,
   `program-fit`). Gut Check is the reference instance of `axis-profile`.
3. **Choose a scoring template** compatible with the archetype. Only
   `axis-scores-to-profile` is implemented today; a scoring-template selector
   is planned.
4. **Draft the intended use / audience** in plain language. This becomes the
   `intendedUse` on a planned concept.

Planned concepts are **not persisted to a database in v1**. They are static,
code-owned metadata in `lib/assessments/assessmentCreationPlan.ts`. If you
want a new planned concept added, an engineer adds it to that file — there is
no admin UI to create one, on purpose, because there is no persistence layer.

## How to activate a planned path

Activation is the work that turns a planned concept into a live, public,
registered assessment. It still requires engineering. The full, reusable
checklist is on `/admin/assessments` and in
`lib/assessments/assessmentCreationPlan.ts` (`ASSESSMENT_ACTIVATION_CHECKLIST`).

The 16 steps, grouped by ownership:

**Admin-owned (can be done today):**
1. Choose a problem point
2. Choose an archetype
3. Choose a scoring template *(planned — selector not built)*
4. Author the question set (`/admin/question-sets/author`)
5. Publish readiness (`/admin/assessments` checklist)

**Engineering-owned:**
6. Map answers / scoring dispatch *(planned — must decouple from Gut Check engine)*
7. Add a registry entry *(code-owned)*
8. Add an operations contract *(code-owned)*
9. Add factory coordinates *(code-owned)*
10. Add scoring dispatch *(planned)*
11. Configure email / PDF / webhook / CTA routing *(planned)*

**Shared (admin content + engineering guardrail):**
12. Define outcomes *(planned — outcome builder not built)*
13. Add result pack / outcome mapping (`/admin/results-packs` + engineering for non-level)
14. Configure artifact payload coverage *(manual-review)*
15. Preview all outcomes *(manual-review — forced-result preview not built)*
16. QA the public route *(planned — requires the public route to exist first)*

A planned concept is **not live, not registered, not routed, and not public**
until every step is complete. `isPlannedConceptLive()` always returns `false`
for every concept in v1.

## How multiple assessments belong to one problem point

Problem points are **categories**, not single assessments. One problem point
can hold many planned assessment concepts. The seed concepts in
`assessmentCreationPlan.ts` prove this:

- `gut-health` → Gut Check (live) + planned digestive reactivity check-in +
  planned reintroduction readiness quiz
- `baseline-readiness` → planned starter readiness assessment + planned meal
  rhythm audit + planned tracking readiness quiz
- `program-fit` → planned program fit router + planned product fit quiz

These are planning-only. None are registered, routed, or public.

## What admins can do now

- Edit Gut Check question sets and results packs in the CMS.
- Preview question sets and results packs.
- Publish question-set and results-pack pointers (admin role only).
- Use the factory vocabulary (problem points, archetypes, templates) to plan
  a new assessment.
- Read the operations contract, readiness checklist, factory model, and
  creation-system maturity surface on `/admin/assessments`.

## What still requires engineering

- Adding a live assessment registry entry.
- Declaring an operations contract + factory coordinates.
- Wiring scoring dispatch by `assessmentType` (today it is keyed by
  `assessmentVersion`, which would route a v2 assessment through the Gut
  Check axis engine).
- Adding a public route for a second assessment.
- Configuring per-assessment email / PDF / webhook / CTA routing.
- Building the scoring-template selector, outcome builder UI, and
  forced-result preview harness.
- DB persistence for planned concepts (not built in v1).

## What not to do yet

- Do not add a second assessment to `ASSESSMENT_REGISTRY` to "try it out" —
  a non-live entry must not be added to the runtime registry.
- Do not add a public route for a planned concept.
- Do not assume the scoring engine will score a new assessment correctly
  without assessment-type-keyed dispatch.
- Do not invent final public branding or medical claims for a planned
  concept — working titles are planning labels only.
- Do not pretend planned concepts are persisted. They are static code-owned
  metadata in v1.

## Recommended next packet

Two viable next steps; pick one based on product priority:

- **L1 — Creation wizard v1.** Build a read-only wizard UI on
  `/admin/assessments/create` that walks an admin through the activation
  checklist and emits a planning stub (still not persisted, still not live).
  Advances the creation-system mechanism.
- **L2 — Second assessment test.** Build a real second assessment on the
  `score-band` archetype + `total-score-to-levels` template for
  `baseline-readiness`, with assessment-type-keyed scoring dispatch as the
  first sub-step. Proves the factory model against a real second instance.

Recommended: **L1** if maturity review confirms the creation system is the
bottleneck; **L2** if a visible second assessment is the higher product
priority. Either way, assessment-type-keyed scoring dispatch is a
prerequisite for L2.

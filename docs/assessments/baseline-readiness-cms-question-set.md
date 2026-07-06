# Baseline Readiness — CMS Question Set Spec (v1)

Packet R content spec for authoring the Baseline Readiness question set in the
CMS. **Do not treat this as published content** — registry status remains
`draft` until engineering promotes it after CMS QA.

## Inventory (current state)

| Field | Value |
| --- | --- |
| Assessment slug | `baseline-readiness` |
| Assessment type | `baseline-readiness` |
| Registry status | **`draft`** (not public) |
| Question set version (CMS DB) | `1` |
| Schema version (JSON `version`) | `"2"` (v2 question schema) |
| Results content version | `v1-internal` |
| Scoring template | `total-score-to-levels` |
| Scoring adapter | `baseline-readiness-total-score-v1-provisional` |
| Outcome level IDs | `readiness-low`, `readiness-building`, `readiness-ready` |
| Internal fixture source | `lib/assessments/internal/baselineReadinessFixture.ts` |
| CMS-ready JSON spec | [`content/assessments/baseline-readiness/questions_v1.json`](../../content/assessments/baseline-readiness/questions_v1.json) |

### Question IDs and option scoring

All questions use 4 options with values **0–3** (0 = lowest agreement/frequency,
3 = highest). Option IDs follow `{questionId}-opt-{value}`.

| Order | Question ID | Prompt (summary) | Option IDs | Values |
| --- | --- | --- | --- | --- |
| 1 | `br-q1` | Meal timing consistency | `br-q1-opt-0` … `br-q1-opt-3` | 0–3 |
| 2 | `br-q2` | Meal composition mix | `br-q2-opt-0` … `br-q2-opt-3` | 0–3 |
| 3 | `br-q3` | Post-meal observation | `br-q3-opt-0` … `br-q3-opt-3` | 0–3 |
| 4 | `br-q4` | 24-hour meal planning | `br-q4-opt-0` … `br-q4-opt-3` | 0–3 |
| 5 | `br-q5` | Tracking readiness | `br-q5-opt-0` … `br-q5-opt-3` | 0–3 |

The internal fixture uses placeholder copy (`[Internal fixture] Readiness question N`).
The CMS spec JSON carries provisional product copy while **preserving the same
IDs and scoring values** so the provisional adapter continues to work.

### Avatars array

Include in the question set JSON:

```json
"avatars": ["readiness-low", "readiness-building", "readiness-ready"]
```

This prevents fallback to Gut Check `level1`–`level4` avatars when the CMS
question set is converted to runtime config.

## Missing CMS requirements (before public launch)

- [ ] `question_sets` identity row: `assessment_type=baseline-readiness`, `assessment_version=1`
- [ ] Published `question_set_revisions` row with validated v2 JSON
- [ ] `question_set_pointers.published_revision_id` set (admin publish)
- [ ] Product/clinical review of question copy (current copy is provisional)
- [ ] **Validator gap:** `validateQuestionSet` currently requires `assessmentType === "gut-check"` — see [Known limitation](#known-limitation-question-set-validator) below

## How to manually enter in CMS

1. Open **`/admin/question-sets`** (or create a new question set identity if none
   exists for `baseline-readiness` v1).
2. Create the identity row if needed:
   - `assessment_type`: `baseline-readiness`
   - `assessment_version`: `1`
   - `locale`: null (default)
3. Create a draft revision. Paste or import the JSON from
   [`content/assessments/baseline-readiness/questions_v1.json`](../../content/assessments/baseline-readiness/questions_v1.json).
4. Confirm:
   - 5 questions with IDs `br-q1` … `br-q5`
   - 4 options per question, values 0–3 exactly once each
   - `avatars` array present with three readiness level ids
5. Preview the draft revision (admin preview — not public).
6. Publish when copy is approved. Set the published pointer on the identity row.

**Do not** flip registry status to `active` until all publish-readiness checks
pass (see [baseline-readiness-result-packs.md](./baseline-readiness-result-packs.md)
and [adding-a-new-assessment.md](./adding-a-new-assessment.md)).

## CMS field mapping notes

| CMS / JSON field | Value / notes |
| --- | --- |
| `question_sets.assessment_type` | `baseline-readiness` |
| `question_sets.assessment_version` | `1` |
| `content_json.version` | `"2"` (schema version, not assessment version) |
| `content_json.assessmentType` | `baseline-readiness` |
| `content_json.avatars` | `["readiness-low","readiness-building","readiness-ready"]` |
| `content_json.sections[].questionIds` | Must reference all 5 question ids |
| `questions[].options[].value` | Must be 0, 1, 2, 3 exactly once per question |

## Scoring contract (provisional)

The adapter sums option values (max total = 15 for 5×4 options) and maps:

| Total ratio | Level ID |
| --- | --- |
| ≤ 33% of max | `readiness-low` |
| ≤ 66% of max | `readiness-building` |
| > 66% of max | `readiness-ready` |

**Important:** Question count or option values in CMS must match what the
adapter expects, or scoring will fail closed. If product changes question
count, engineering must update the adapter in a separate packet.

## Known limitation: question set validator

[`lib/questionSet/validateQuestionSetShared.ts`](../../lib/questionSet/validateQuestionSetShared.ts)
hardcodes `assessmentType must be "gut-check"`. The authoring UI at
`/admin/question-sets/author` will reject Baseline Readiness JSON until that
validator is extended (future engineering packet).

**Workaround for CMS entry today:** import JSON via direct revision insert or
admin API paths that do not run the gut-check-only validator, or wait for
validator extension. The repo spec JSON is structurally valid v2 aside from
assessment type.

## Relationship to Packet Q and public promotion

| Phase | What exists |
| --- | --- |
| Packet Q (merged) | Registry `draft`, internal fixture, scoring adapter, outcome mapper, admin routes, forced preview |
| **Packet R (this doc)** | CMS-ready question set spec + result pack drafts (repo only, not in Supabase) |
| Before public launch | Publish CMS question set + 3 result packs, QA forced preview + internal runner, promote registry to `active` |

## QA after CMS publish

1. Internal fixture runner still works at
   `/admin/assessments/baseline-readiness/start` (code fixture — unchanged).
2. After CMS publish, confirm CMS question set resolves for
   `baseline-readiness` v1 via admin preview.
3. Forced preview at
   `/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low`
   should load published packs (once result packs are also published).

See [`forced-result-preview.md`](./forced-result-preview.md).

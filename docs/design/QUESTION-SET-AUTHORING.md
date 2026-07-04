# Direct Question-Set Authoring (Packet C)

Editors and admins can author assessment question sets directly as structured JSON — CSV upload is no longer required for day-to-day editing. Both paths share one persistence service, so CSV import and direct JSON authoring produce identical immutable revision records.

## Routes

- **Authoring UI:** `/admin/question-sets/author` — edit JSON, validate, save draft, optionally set preview.
- **Direct save API:** `POST /api/admin/question-sets/save-json` (editor/admin).
- **CSV import (unchanged):** `POST /api/admin/question-sets/import-csv` (editor/admin).
- **Set preview pointer:** `POST /api/admin/question-set-pointers/preview` (editor/admin).
- **Publish pointer:** `POST /api/admin/question-set-pointers/publish` (admin only).
- **Manage revisions:** `/admin/question-sets/[questionSetId]`.

## Save flow (shared)

`lib/questionSet/saveQuestionSetRevision.ts` is the single server-side path for both CSV import and direct JSON authoring:

1. Validate the QuestionSet JSON with `validateQuestionSet` (v2 schema).
2. Compute a stable SHA-256 `content_hash` from normalized (key-sorted) JSON.
3. Find or create the `question_sets` identity row by `(assessment_type, assessment_version, locale)`.
4. Duplicate check: if an immutable revision with the same `content_hash` already exists, return it as a `duplicate` result (explicit, consistent with the prior importer). No new row is written.
5. Insert a new immutable `draft` revision with a monotonic `revision_number` (one retry on race).
6. Optionally set the preview pointer when `setPreview` is true.
7. Write a `content_audit_log` entry (`questions.save_json` or `questions.import_csv`).

Publishing is **not** done here. Publish remains admin-only via `/api/admin/question-set-pointers/publish`, which re-validates before setting `published_revision_id`. Public runtime (`/assessments/[slug]/start` and `/api/question-sets/resolve`) continues to resolve the published revision only — drafts and preview revisions never reach normal users.

## QuestionSet JSON contract (v2)

```json
{
  "version": "2",
  "assessmentType": "gut-check",
  "sections": [
    { "id": "s1", "title": "Section 1", "questionIds": ["q1"] }
  ],
  "questions": [
    {
      "id": "q1",
      "text": "How often do you experience bloating?",
      "options": [
        { "id": "o1", "label": "Rarely or never", "value": 0 },
        { "id": "o2", "label": "Occasionally", "value": 1 },
        { "id": "o3", "label": "Frequently", "value": 2 },
        { "id": "o4", "label": "Almost daily", "value": 3 }
      ]
    }
  ]
}
```

### Rules (enforced by `validateQuestionSet`)

- `version` must be `"2"`.
- `assessmentType` must be `"gut-check"` (the only registered assessment today).
- `sections[]` non-empty; each section has a unique `id`, a `title`, and a non-empty `questionIds[]`.
- Every `section.questionIds` entry must reference an existing `question.id`.
- `questions[]` non-empty; each question has a unique `id`, a `text`, and **exactly 4** `options`.
- Each option has `id`, `label`, and `value` ∈ `{0,1,2,3}`.
- Within a question, option `id`s are unique and the four `value`s `{0,1,2,3}` each appear exactly once.

### Identity fields (not part of the QuestionSet JSON)

The save API takes these alongside `questionSet`:

- `assessmentType` (defaults from `questionSet.assessmentType`)
- `assessmentVersion` (required; stored as TEXT in `question_sets.assessment_version`)
- `locale` (optional; null/empty = default locale)
- `notes` (optional author note stored on the revision)
- `setPreview` (boolean; also set the preview pointer after saving)

## API responses (`save-json`)

- `200` — draft created: `{ ok, kind: "created", questionSetId, revisionId, revisionNumber, contentHash, status: "draft", createdAt, previewSet, previewUrl, manageUrl }`
- `409` — duplicate content: same shape with `kind: "duplicate"`, referencing the existing revision. No new row written.
- `400` — validation error: `{ ok: false, kind: "validation", errors: string[], warnings: string[] }`
- `401 / 403` — not authenticated / not editor or admin.
- `500` — server error.

## Follow-ups

- Packet D: full runtime preview UX for editors on `/assessments/[slug]/start?preview=1` (today preview resolves via the API and the formatted preview page, but there is no dedicated in-app preview chrome).
- CMS-backed cover config storage (separate from question-set authoring).

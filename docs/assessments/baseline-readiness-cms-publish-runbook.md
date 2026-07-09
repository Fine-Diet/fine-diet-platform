# Baseline Readiness — CMS Publish Runbook (v1, updated X4c)

Packet T admin runbook for publishing the Baseline Readiness question set v1
and the three Flow v2 result packs at `v1-internal`, then QA-checking them with
forced preview.

**Post–Packet X4 status:** Guarded activation is **complete** and
production-verified. Registry status is `active`, `/assessments/baseline-readiness`
is reachable for direct-link use, and the full assessment runner/results path is
live. **Public marketing launch remains NO-GO:** the route stays
`noindex,follow`, is excluded from the sitemap, and downstream artifacts (email,
PDF, webhook, claim, account-save) remain disabled/hidden.

This runbook covers **CMS content operations** and **operator QA**. Completing
CMS publish steps does **not** approve public marketing launch. Merge readiness
and guarded activation are separate from marketing sign-off.

**Packet U** adds a guarded staging QA operator (`npm run assessments:baseline-readiness:qa`)
that validates source JSON, plans CMS identities, optionally runs forced-preview
checks, and emits a markdown QA report. By default it is **dry-run only** — see
[§10 Staging QA operator](#10-staging-qa-operator-packet-u).

> Source of truth for content paths, IDs, and CMS identities. If another doc
> conflicts, this runbook wins for publish steps. Related specs:
> [`baseline-readiness-cms-question-set.md`](./baseline-readiness-cms-question-set.md),
> [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md),
> [`forced-result-preview.md`](./forced-result-preview.md),
> [`adding-a-new-assessment.md`](./adding-a-new-assessment.md).

---

## 0. Scope and hard limits

What this runbook covers:

- Publishing the Baseline Readiness question set (assessment type
  `baseline-readiness`, version `1`).
- Publishing three result packs at `v1-internal`:
  `readiness-low`, `readiness-building`, `readiness-ready`.
- Forced-preview QA for all three outcome levels.
- Evidence capture, rollback, and go/no-go.

What this runbook does **not** do:

- Does not approve **public marketing launch** (separate checklist in §12).
- Does not remove the `noindex,follow` SEO guard or add Baseline to the sitemap.
- Does not enable email / PDF / webhook / claim / account-save downstream artifacts.
- Does not modify scoring, outcome mapping, or Gut Check behavior.
- Does not roll back guarded activation (registry `active`, public route live).

**CMS publish-path complete ≠ public marketing launch approved.** Publishing question
sets and result packs in CMS is a prerequisite. Guarded activation (X4) made the
assessment operationally live with direct-link access. Marketing launch still
requires content approval, artifact enablement, and explicit SEO/indexing sign-off.

If any step appears to require a code/runtime change, a migration, or a
Supabase write outside the documented admin UI/API surfaces, **stop and file a
follow-up** rather than improvising.

---

## 1. Preflight checklist

Complete **every** item before authoring or publishing. Mark each box.

### 1.1 Dependency and access

- [ ] **Packet S / PR #124 is merged.** Baseline Readiness question-set JSON
  must validate in the shared v2 validator and the admin authoring UI
  (`/admin/question-sets/author`). If PR #124 is still open, do not publish —
  the authoring UI will reject `baseline-readiness` JSON.
- [ ] **This branch is on `main`** (or Packet T was rebased onto `main` after
  PR #124 merged). Packet T is based on the Packet S branch on purpose; merge
  PR #124 first.
- [ ] **You have `admin` or `editor` access** to the admin app. Note: only
  `admin` role can publish revisions (the Publish buttons are admin-only in
  both the question-set and results-pack manage pages). An `editor` can
  author, save drafts, and set preview pointers but cannot publish.
- [ ] You are running against the intended environment (e.g. preview/staging
  Supabase project, not production) and you know which one.

### 1.2 Guarded activation and marketing launch posture

- [ ] **Baseline Readiness registry is `active`.** Confirm on
  `/admin/assessments/baseline-readiness` — the hub shows
  `Registry entry: yes (active)`. Do **not** roll back to `draft` during CMS ops.
- [ ] **Public route is live (direct link).** `/assessments/baseline-readiness`
  must respond (not 404) for guarded activation. It is reachable for direct-link
  use but **not** marketed publicly.
- [ ] **SEO remains noindex,follow.** Confirm robots meta on the public cover
  route includes `noindex`. Do not remove the override until marketing launch (§12).
- [ ] **Route excluded from sitemap.** `pages/sitemap.xml.tsx` does not list
  assessment routes; confirm Baseline is not added during this work.
- [ ] **Downstream artifacts remain disabled.** Email, PDF, webhook, claim, and
  account-save must stay hidden via the operations contract until §12.

### 1.3 Source files exist and validate

- [ ] Question-set source file exists:
  [`content/assessments/baseline-readiness/questions_v1.json`](../../content/assessments/baseline-readiness/questions_v1.json)
- [ ] Result-pack source file exists:
  [`content/assessments/baseline-readiness/results_v1-internal.json`](../../content/assessments/baseline-readiness/results_v1-internal.json)
- [ ] **Question-set JSON validates.** Repo test
  `lib/assessments/__tests__/baselineReadinessContentSpec.test.ts` confirms
  spec IDs match the internal fixture and the JSON is well-formed. Run
  `npm test -- baselineReadinessContentSpec` if unsure. The authoring UI also
  validates live.
- [ ] **All three result packs validate as Flow v2.** The same repo test
  confirms `packs.readiness-low`, `packs.readiness-building`, and
  `packs.readiness-ready` each pass `validateResultsPack` (Flow v2 structure,
  exactly 3 snapshot bullets, exactly 3 step bullets, exactly 3 try bullets,
  exactly 4 mechanism pills, exactly 3 method-learn bullets, required strings,
  valid YouTube URL).

### 1.4 Content acceptance for internal publish

The `v1-internal` packs deliberately use placeholder CTAs and a placeholder
video URL. Decide and record which applies before publishing:

- [ ] **Placeholder CTAs are explicitly accepted** for this internal publish.
  Draft CTA labels include the word `(placeholder)` and `methodCtaUrl` is
  `/method` for all three packs. Record the accepter and date in the evidence
  table (§6). **Or**
- [ ] **Placeholder CTAs are a blocker** — production-quality CTAs/URLs are
  required before publishing. Stop here and file a content follow-up. Do not
  publish with un-accepted placeholders.
- [ ] **Placeholder video URL is explicitly accepted** for this internal
  publish. All three packs currently point `videoAssetUrl` at the same
  placeholder YouTube URL. Record acceptance in the evidence table. **Or**
- [ ] **Placeholder video is a blocker** — real Baseline Readiness videos are
  required first. Stop here.

### 1.5 No downstream side effects

- [ ] `channels.email.enabled` is `false` in all three packs (it is — confirm
  in the JSON).
- [ ] `channels.pdf.enabled` is `false` in all three packs (it is — confirm).
- [ ] No webhook / claim / saved-account routing is expected to fire from
  forced preview. (Forced preview is side-effect-free by design — see
  [`forced-result-preview.md`](./forced-result-preview.md).)
- [ ] You understand this publish is **internal/draft content readiness**, not
  a public launch. No marketing surface, no email send, no PDF generation is
  implied.

### 1.6 Known CMS gap to plan for

- [ ] **Result-pack identity creation is API-only today.** The
  `/admin/results-packs` list page has no "Create pack" button. Pack identity
  rows must be created via `POST /api/admin/results-packs/create`
  (idempotent upsert on `assessment_type, results_version, level_id`) before a
  first revision can be saved through the form editor. See §4.1. If your
  environment already has a UI for this, use it; otherwise use the API
  endpoint with an admin session.

---

## 2. Identities at a glance

| Artifact | Assessment type | Version | Level ID | Source path |
| --- | --- | --- | --- | --- |
| Question set | `baseline-readiness` | `1` (CMS `assessment_version`) | n/a | `content/assessments/baseline-readiness/questions_v1.json` |
| Result pack | `baseline-readiness` | `v1-internal` | `readiness-low` | `content/assessments/baseline-readiness/results_v1-internal.json` → `packs.readiness-low` |
| Result pack | `baseline-readiness` | `v1-internal` | `readiness-building` | `…results_v1-internal.json` → `packs.readiness-building` |
| Result pack | `baseline-readiness` | `v1-internal` | `readiness-ready` | `…results_v1-internal.json` → `packs.readiness-ready` |

Notes on identity fields:

- Question-set CMS identity uses `assessment_type` + `assessment_version` +
  `locale` (locale blank = default). The JSON's `"version": "2"` is the
  **schema version**, not the assessment version. Do not confuse them.
- Question-set JSON must include `"avatars": ["readiness-low",
  "readiness-building", "readiness-ready"]` so runtime does not fall back to
  Gut Check `level1`–`level4` avatars.
- Result-pack CMS identity uses `assessment_type` + `results_version` +
  `level_id` (snake_case in the API). The generated slug pattern is
  `baseline-readiness:v1-internal:<level_id>`.

Expected question IDs: `br-q1`, `br-q2`, `br-q3`, `br-q4`, `br-q5` — four
options each, values `0,1,2,3` exactly once per question.

Expected avatars / outcome level IDs: `readiness-low`, `readiness-building`,
`readiness-ready`.

---

## 3. Question-set publishing steps (v1)

Goal: publish a `question_set_revisions` row for `baseline-readiness` v1 and
set the published pointer on the identity row.

### 3.1 Open the authoring UI

1. Sign in to the admin app with an `admin` (or `editor`) account.
2. Open **`/admin/question-sets/author`** (the structured author page).
   - The list page at `/admin/question-sets` has an **Author JSON** button in
     the top-right that links here.
3. In the **Identity** card:
   - **Assessment Type:** `baseline-readiness`
     (pick it from the datalist — it is labelled "operationally live — marketing NO-GO"). The UI
     shows an amber reminder that guarded activation is complete; saving here updates CMS
     content only and does not approve public marketing launch.
   - **Version:** `1`
   - **Locale:** leave blank (default).

### 3.2 Load / paste the JSON

4. Click **Load existing (preview/published)**. If a prior revision exists for
   `baseline-readiness` v1, it loads into the editor. If none exists, you get
   an error and should author from the source JSON (next step).
5. If loading found nothing (or you want to overwrite from source), open
   [`content/assessments/baseline-readiness/questions_v1.json`](../../content/assessments/baseline-readiness/questions_v1.json)
   and paste it into the **JSON (advanced)** view of the editor, then switch
   back to the structured view.

### 3.3 Validate

6. Live validation runs as you edit. Confirm **no validation errors** and that
   the contract panel at the bottom is satisfied:
   - `version` is `"2"`
   - `assessmentType` is `"baseline-readiness"`
   - `avatars` array present with `readiness-low`, `readiness-building`,
     `readiness-ready`
   - one section with all five question IDs
   - each question has exactly 4 options with values `0,1,2,3` once each
7. The **Save draft** button is disabled until validation passes. Do not save
   until it is enabled.

### 3.4 Save draft revision

8. (Optional) Enter a **Notes** value, e.g. `Baseline Readiness v1 internal publish`.
9. (Optional) Tick **Set this revision as the preview pointer after saving**
   if you want the preview pointer set immediately.
10. Click **Save draft**. Save goes through
    `POST /api/admin/question-sets/save-json` and creates an immutable draft
    revision (or returns the existing revision if content is a duplicate).
11. On success, the page shows the revision number, content hash, and links:
    - **Manage revisions** → `/admin/question-sets/<questionSetId>`
    - **Formatted preview** → `/admin/question-sets/preview/<questionSetId>?revisionId=<revisionId>`
    - **Preview API (JSON)** → `/api/question-sets/resolve?assessmentType=baseline-readiness&assessmentVersion=1&preview=1`

### 3.5 Preview

12. Open **Formatted preview** and confirm:
    - section title "Baseline Readiness"
    - five questions `br-q1`…`br-q5` with the expected option labels
    - no rendering errors
13. (Optional, internal only) If a preview pointer is set, the runtime preview
    links (`Preview cover ↗` / `Preview runner ↗`) point at
    `/assessments/baseline-readiness?preview=1&v=1`. With guarded activation live,
    these links work for admin/editor preview sessions. Use the formatted admin
    preview and forced-preview harness for CMS QA as well.

### 3.6 Publish (admin only)

14. Open **Manage revisions** (`/admin/question-sets/<questionSetId>`).
15. In the **Revisions** table, find the draft revision you just saved.
16. (Editor) Click **Set Preview** if you want to set the preview pointer first.
17. (Admin) Click **Publish** on that revision. Publish calls
    `POST /api/admin/question-set-pointers/publish` with
    `{ questionSetId, revisionId }` and sets `published_revision_id` on the
    identity's pointer row.
18. Confirm the **Current Pointers** card now shows the revision as
    **Published**.
19. Re-confirm guarded activation on `/admin/assessments/baseline-readiness`:
    registry still `active`, public route still live, SEO still `noindex,follow`.

### 3.7 Question-set validation checklist

- [ ] `assessment_type` = `baseline-readiness`
- [ ] `assessment_version` = `1`
- [ ] `content_json.version` = `"2"`
- [ ] `content_json.assessmentType` = `baseline-readiness`
- [ ] `content_json.avatars` = `["readiness-low","readiness-building","readiness-ready"]`
- [ ] Section `section-readiness` references all 5 question IDs
- [ ] Questions `br-q1`…`br-q5` present, each with 4 options values 0–3
- [ ] Draft revision saved (note revision number)
- [ ] Formatted preview renders correctly
- [ ] Revision published (admin) and published pointer set
- [ ] Registry still `active`; public route still live; SEO still noindex,follow

---

## 4. Result-pack publishing steps (v1-internal)

Goal: for each of the three level IDs, publish a `results_pack_revisions` row
at `v1-internal` and set the published pointer on the pack identity row.

Repeat §4.1 → §4.5 **three times**, once per level:

| Level ID | Label (from JSON) | Source object |
| --- | --- | --- |
| `readiness-low` | "Low readiness" | `packs.readiness-low` |
| `readiness-building` | "Building readiness" | `packs.readiness-building` |
| `readiness-ready` | "Ready to start" | `packs.readiness-ready` |

Target assessment type: `baseline-readiness`. Target results version:
`v1-internal` (must match `BASELINE_READINESS_RESULTS_CONTENT_VERSION` and the
forced-preview resolver query params).

### 4.1 Create the pack identity (first time only)

The `/admin/results-packs` list page has no "Create pack" button. Create the
identity row via the API (idempotent upsert):

```http
POST /api/admin/results-packs/create
Content-Type: application/json

{
  "assessment_type": "baseline-readiness",
  "results_version": "v1-internal",
  "level_id": "<readiness-low|readiness-building|readiness-ready>"
}
```

- Requires an `editor` or `admin` session.
- Idempotent on the `(assessment_type, results_version, level_id)` unique key.
- Returns the pack row (including `id` — save it for §4.2).

Do this for each of the three level IDs. After this step, the three packs
appear in `/admin/results-packs` with no published/preview revision.

> If a later packet adds a UI button for pack identity creation, prefer it.
> This runbook does not add one.

### 4.2 Open the pack manage page

1. Open **`/admin/results-packs`**.
2. Find the row for `baseline-readiness` · `v1-internal` · `<level id>`.
3. Click **Manage** → `/admin/results-packs/<packId>`.
4. Confirm the **Pack Identity** card shows the correct
   `Assessment Type`, `Results Version` (`v1-internal`), and `Level ID`.

### 4.3 Create a draft revision with the source content

5. Click **Create New Revision**
   (→ `/admin/results-packs/edit/<revisionId | packId>`). The form editor
   opens. If there is no prior revision, the form starts empty.
6. The form editor is field-based (Flow v2 page 1 / page 2 / page 3 cards).
   The cleanest path for an exact internal-publish is to paste the matching
   `packs.<level_id>` object from
   [`results_v1-internal.json`](../../content/assessments/baseline-readiness/results_v1-internal.json)
   into the revision content. Two options:
   - **Field-by-field:** copy each field from the JSON into the matching form
     input (label, summary, page1/2/3 fields, channels, etc.).
   - **JSON via API:** save the draft revision directly via
     `POST /api/admin/results-packs/<packId>/revisions/create` with
     `{ "content_json": <packs.<level_id> object>, "change_summary": "..." }`.
     The endpoint runs `validateResultsPack`, normalizes, hashes, and inserts
     an immutable draft revision. This is the most faithful way to publish the
     exact source JSON and is recommended for an internal publish.
7. Whichever path you take, the revision is saved as a **draft** (immutable).
   Save records `change_summary`, `content_hash`, and validation status.

### 4.4 Validate and preview

8. Confirm validation passed (the create-revision API returns
   `validation.ok` and any errors/warnings; the form editor surfaces
   validation errors inline). Fix and re-save if `validation.ok` is false.
9. Set the revision as the preview pointer: on the manage page, click
   **Set Preview** for the revision
   (`POST /api/admin/results-packs/<packId>/preview`).
10. Open the preview at `/admin/results-packs/preview/<packId>` and confirm:
    - pack label / title from the JSON renders
    - page 1 headline, snapshot bullets (3), meaning body
    - page 2 headline, step bullets (3), video CTA label, video URL resolves
    - page 3 problem headline, try bullets (3), mechanism pills (4),
      method CTA label / URL, method email link label
    - no "missing pack" or validation error

### 4.5 Publish (admin only)

11. On the manage page, click **Publish** on the revision
    (`POST /api/admin/results-packs/<packId>/publish`). Requires `admin`
    role. This sets `published_revision_id` on the pack's pointer row.
12. Confirm the **Pointers** card shows the revision as **Published**.
13. Repeat §4.1 → §4.5 for the next level ID until all three are published.

### 4.6 Per-pack publish checklist (copy for each level)

#### readiness-low

- [ ] Identity created: `baseline-readiness` / `v1-internal` / `readiness-low`
- [ ] Draft revision saved from `packs.readiness-low`
- [ ] `validateResultsPack` passed (`validation.ok = true`)
- [ ] Preview pointer set; `/admin/results-packs/preview/<packId>` renders
- [ ] Label "Low readiness" shown
- [ ] Page 1 / Page 2 / Page 3 render with Flow v2 structure
- [ ] Published (admin); published pointer set

#### readiness-building

- [ ] Identity created: `baseline-readiness` / `v1-internal` / `readiness-building`
- [ ] Draft revision saved from `packs.readiness-building`
- [ ] `validateResultsPack` passed
- [ ] Preview pointer set; preview renders
- [ ] Label "Building readiness" shown
- [ ] Page 1 / Page 2 / Page 3 render with Flow v2 structure
- [ ] Published (admin); published pointer set

#### readiness-ready

- [ ] Identity created: `baseline-readiness` / `v1-internal` / `readiness-ready`
- [ ] Draft revision saved from `packs.readiness-ready`
- [ ] `validateResultsPack` passed
- [ ] Preview pointer set; preview renders
- [ ] Label "Ready to start" shown
- [ ] Page 1 / Page 2 / Page 3 render with Flow v2 structure
- [ ] Published (admin); published pointer set

### 4.7 Result-pack validation checklist (per pack)

- [ ] `assessment_type` = `baseline-readiness`
- [ ] `results_version` = `v1-internal`
- [ ] `level_id` matches the pack
- [ ] `label` matches the JSON label
- [ ] `flow.page1.snapshotBullets` has exactly 3
- [ ] `flow.page2.stepBullets` has exactly 3
- [ ] `flow.page2.videoAssetUrl` is a valid YouTube URL (placeholder accepted per §1.4)
- [ ] `flow.page3.tryBullets` has exactly 3
- [ ] `flow.page3.mechanismPills` has exactly 4
- [ ] `flow.page3.methodLearnBullets` has exactly 3
- [ ] `channels.email.enabled` = `false`
- [ ] `channels.pdf.enabled` = `false`

---

## 5. Forced-preview QA checklist

After the question set and **all three** result packs are published, run
forced preview for each outcome. Forced preview is admin/dev-only, writes no
submission, runs no scoring, and triggers no email / webhook / claim /
saved-account / analytics side effects (see
[`forced-result-preview.md`](./forced-result-preview.md)).

### 5.1 Forced-preview URLs

```
/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low
/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-building
/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-ready
```

(Also linked from the hub at `/admin/assessments/baseline-readiness`.)

### 5.2 Per-outcome QA checklist (copy for each level)

For each `forceOutcome` value, capture:

- [ ] Page loads (screenshot or note "page loads")
- [ ] Result pack title / label shown matches the published pack label
- [ ] Correct outcome level shown (the `forceOutcome` level)
- [ ] Flow v2 **page 1** appears (headline, snapshot, meaning)
- [ ] Flow v2 **page 2** appears (steps, video CTA)
- [ ] Flow v2 **page 3** appears (problem, mechanism, method CTA)
- [ ] CTA appears and is **placeholder or final** as expected per §1.4
- [ ] Video placeholder appears, **or** a "no video yet" state is acceptable
      per §1.4 (placeholder YouTube URL is expected for `v1-internal`)
- [ ] No email / PDF / webhook side effects happen (forced preview is
      side-effect-free by design — confirm nothing unexpected fired)
- [ ] No user submission is created
- [ ] No claim / account state is created
- [ ] Errors are absent **or** documented (e.g. a known placeholder-warning
      is acceptable if recorded)

Before publishing the packs, forced preview is expected to show a safe
"Could not load results pack" error. After all three packs are published, the
three forced-preview URLs should render the Flow v2 content instead.

### 5.3 Optional: internal fixture runner

- [ ] (Optional) `/admin/assessments/baseline-readiness/start` still works
      (code-owned 5-question fixture, preview-only, no persist). This is
      unchanged by CMS publish and is a sanity check that runtime scoring /
      outcome mapping still resolve.

---

## 6. Evidence capture

Fill this in as you go. Keep it with the publish record (e.g. attach to the
PR / change ticket).

| Field | Value |
| --- | --- |
| Date / time (start) | 2026-07-08 (X5b CMS publish) |
| Date / time (finish) | 2026-07-09 (X5d live E2E evidence) |
| Environment (Supabase project / URL) | Production — `https://myfinediet.com` |
| Admin user (email) | Rashad (X5b CMS publish) |
| Admin role (`admin` / `editor`) | admin |
| Packet S / PR #124 merged? | yes |
| Registry status (before) | active |
| Registry status (after) | active (must remain active) |
| Public route `/assessments/baseline-readiness` | live (direct link; noindex,follow) |
| SEO / sitemap | noindex,follow; not in sitemap |
| Downstream artifacts | email/pdf/webhook/claim/account-save disabled |

### 6.1 Question-set publish status

| Item | Value |
| --- | --- |
| Question-set ID | |
| Revision number published | |
| Content hash (first 12) | |
| Published pointer set? | yes / no |
| Formatted preview OK? | yes / no |

### 6.2 Result-pack publish status

| Level ID | Pack ID | Revision # | Content hash | Published? | Preview OK? |
| --- | --- | --- | --- | --- | --- |
| readiness-low | `1e4ab583-218b-496a-9669-24d8cbdd81f9` | 3 | (see CMS) | yes | yes (X6.1 2026-07-09) |
| readiness-building | `c9fe2037-1bad-4425-85b2-03878633d0a5` | 3 | (see CMS) | yes | yes (X6.1 2026-07-09) |
| readiness-ready | `e84a7e1f-cc93-465c-8463-7bba7fa5e3fe` | 3 | (see CMS) | yes | yes (X6.1 2026-07-09) |

### 6.3 Forced-preview status

| forceOutcome | Page loads | Correct level | Page 1 | Page 2 | Page 3 | CTA | Video | No side effects | Screenshot/note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| readiness-low | yes | yes | yes | yes (no video) | yes | `/the-fine-diet-method` | none | yes | QA report 2026-07-09 |
| readiness-building | yes | yes | yes | yes (no video) | yes | `/the-fine-diet-method` | none | yes | QA report 2026-07-09 |
| readiness-ready | yes | yes | yes | yes (no video) | yes | `/the-fine-diet-method` | none | yes | QA report 2026-07-09 |

### 6.4 Content acceptance

| Item | Accepted? | Accepter | Date | Notes |
| --- | --- | --- | --- | --- |
| Placeholder CTAs (all 3 packs) | yes | Rashad / human-founder | 2026-07-08 | V1 test-candidate CTAs; `/the-fine-diet-method` |
| Placeholder video URL (all 3 packs) | yes (no video) | Rashad / human-founder | 2026-07-08 | Intentionally omitted; Flow v2 no-video |
| Readiness framing copy | yes | Rashad / human-founder | 2026-07-08 | V1 test-candidate body copy |

### 6.7 Live results E2E status (Packet X5d)

Run against production with:

```bash
npm run assessments:baseline-readiness:live-e2e -- --base-url=https://myfinediet.com
```

Report: `.reports/assessments/baseline-readiness-live-e2e-2026-07-09T01-35-51-388Z.md`

| Outcome | Submission ID | Label | Method CTA | Video | Artifacts | Route | noindex | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `readiness-low` | `d918fcf0-ded6-4792-b89e-f0dd38373f27` | Foundation Builder | Start with the Fine Diet Method → `/the-fine-diet-method` **200** | none | hidden | **200** | yes | **PASS** |
| `readiness-building` | `51bf16c8-c9c2-4f7f-a7ed-90634fef14aa` | Rhythm Builder | Build your rhythm… → `/the-fine-diet-method` **200** | none | hidden | **200** | yes | **PASS** |
| `readiness-ready` | `1c92ade1-608f-490c-a429-88c25ff64623` | Ready for Guided Observation | Begin the Fine Diet Method → `/the-fine-diet-method` **200** | none | hidden | **200** | yes | **PASS** |

**Gut Check regression (X5d):** cover **200**, `index,follow`, pack resolve **200**, Baseline absent from sitemap — **PASS**.

**Note:** `ResultsScreen` is client-rendered. Live E2E verifies the same submission → pack → `resolveResultsScreenContent` chain the component uses, plus public route HTTP/noindex. Optional browser screenshots remain polish, not a blocker.

### 6.5 Blockers and follow-up

| Blocker / follow-up | Owner | Status |
| --- | --- | --- |
| | | |

### 6.6 Go / no-go

| Result | (mark one) |
| --- | --- |
| **GO** — CMS publish complete; guarded activation unchanged | |
| **NO-GO** — see blockers | |

Follow-up owner: ___________________

---

## 7. Rollback / unpublish guidance

Use this if published content is wrong. These steps use the existing admin
surfaces only. Do **not** invent destructive SQL.

### 7.1 Revert a published question set

- On `/admin/question-sets/<questionSetId>`, the **Revisions** table lists
  every revision. To roll back:
  - **Prefer repointing:** publish a different (earlier, known-good) revision
    with the **Publish** button on that revision. This atomically moves
    `published_revision_id` to the chosen revision. The bad revision remains
    in history as a draft/archived record but is no longer live.
  - If no known-good revision exists yet, set the **preview** pointer instead
    and leave the published pointer unset (the resolve API will then return
    no published revision for `baseline-readiness` v1).
- Record which revision was published before and after.

### 7.2 Revert a published result pack

- On `/admin/results-packs/<packId>`, use the same repoint approach: publish
  an earlier known-good revision, or unset the published pointer by leaving
  only a preview pointer.
- Repeat per affected level (`readiness-low`, `readiness-building`,
  `readiness-ready`). One pack can be reverted independently of the others.

### 7.3 Preserve guarded activation and marketing NO-GO

- [ ] Do **not** roll back `baseline-readiness` registry status to `draft`.
- [ ] Do **not** remove the `noindex,follow` SEO guard or add Baseline to the sitemap.
- [ ] Downstream artifacts (email, PDF, webhook, claim, account-save) stay disabled
  until marketing launch (§12).

### 7.4 Re-validate before republishing

- [ ] Re-run `npm test -- baselineReadinessContentSpec` to confirm source
      JSON still validates.
- [ ] Re-run `validateResultsPack` (via the create-revision API or form
      editor) on any corrected pack content.
- [ ] Re-run forced preview (§5) for any level whose pack was reverted and
      republished.
- [ ] Record what was reverted and why in the evidence table (§6.5).

### 7.5 What rollback does **not** include

- No `DELETE` statements against `question_sets`, `question_set_revisions`,
  `results_packs`, or `results_pack_revisions`. Revisions are immutable; roll
  back by repointing, not deleting.
- No dropping of registry entries.
- No changes to scoring adapters, outcome mappers, or Gut Check.

---

## 8. Go / no-go checklist

**GO only if all of the following are true:**

- [ ] Question set v1 is **published or staged correctly** (published pointer
      set, formatted preview passes).
- [ ] All three result packs are **published or staged correctly** at
      `v1-internal` (published pointer set on each; or, if intentionally
      staging only, all three have preview pointers and the go decision is
      explicitly "stage only").
- [ ] Forced preview loads **all three** outcomes (`readiness-low`,
      `readiness-building`, `readiness-ready`) with Flow v2 page 1/2/3.
- [ ] Content / copy is **accepted for the current environment** (§1.4 /
      §6.4), or placeholder status is explicitly recorded as a blocker.
- [ ] Placeholder CTA / video status is **explicitly accepted or recorded as blocker** (§1.4 / §6.4).
- [ ] No side effects observed during forced preview (no submission, no
      email/PDF/webhook, no claim/account state).
- [ ] Guarded activation **unchanged**: registry `active`, public route live,
      SEO `noindex,follow`, not in sitemap.
- [ ] Downstream artifacts remain disabled (email, PDF, webhook, claim, account-save).

**NO-GO if any of the following are true:**

- Any of the three packs is missing or not published/staged.
- Question-set or result-pack validation errors.
- Forced preview fails for any level (missing-pack error after publish,
  rendering error, wrong level shown).
- Unexpected side effects observed during forced preview.
- Guarded activation rolled back (registry `draft`, public route 404).
- Placeholder content (CTA / video) is **not** approved and not recorded as a blocker.
- PR #124 / Packet S is not merged.

A NO-GO does not undo the work — record blockers in §6.5, revert per §7 if
needed, and re-run when ready.

---

## 10. Staging QA operator (Packet U)

The repo ships a script-based operator for repeatable staging/internal QA. It
**defaults to dry-run** (read-only) and refuses production writes.

### 10.1 Commands

Dry-run (local, no network required):

```bash
npm run assessments:baseline-readiness:qa
# equivalent:
npm run assessments:baseline-readiness:qa -- --dry-run
```

Live results E2E (Packet X5d — production submission → ResultsScreen chain):

```bash
npm run assessments:baseline-readiness:live-e2e -- --base-url=https://myfinediet.com
```

Dry-run + forced-preview / public-safety checks (requires running app):

```bash
npm run assessments:baseline-readiness:qa -- \
  --base-url=http://localhost:3000
```

Admin API diagnostics (identifies Vercel protection vs app auth vs JSON shape):

```bash
npm run assessments:baseline-readiness:qa -- \
  --diagnose-api \
  --base-url=https://your-staging-host \
  --environment=staging \
  --report-out=.reports/assessments/baseline-readiness-api-diagnose.md
```

If the deployment uses **Vercel Deployment Protection**, also set (do not commit):

```bash
export BASELINE_READINESS_QA_VERCEL_BYPASS='<vercel-automation-bypass-secret>'
```

Optional admin cookie for authenticated preview route checks (do **not** commit):

```bash
export BASELINE_READINESS_QA_ADMIN_COOKIE='sb-...=...; ...'
npm run assessments:baseline-readiness:qa -- \
  --base-url=https://your-staging-host
```

Custom report path:

```bash
npm run assessments:baseline-readiness:qa -- \
  --report-out=.reports/assessments/my-run.md
```

Default report path (gitignored): `.reports/assessments/baseline-readiness-qa-<timestamp>.md`

### 10.2 Apply / staging writes (optional)

Apply mode stages CMS content via existing admin APIs. It **never** changes
registry status, SEO posture, or marketing launch approval.

Required flags **all together**:

- `--apply`
- `--environment=staging` (or `preview`, `internal`, `local`, `development`)
- `--base-url=<staging-host>`
- `--confirm-staging-write`
- `BASELINE_READINESS_QA_ADMIN_COOKIE` env var (admin session cookie)

```bash
export BASELINE_READINESS_QA_ADMIN_COOKIE='...'
npm run assessments:baseline-readiness:qa -- \
  --apply \
  --environment=staging \
  --base-url=https://your-staging-host \
  --confirm-staging-write
```

Optional publish (admin-only APIs — sets published pointers, still **not** a marketing launch):

```bash
  ... --publish-revisions
```

Skip flags:

- `--skip-forced-preview` — skip HTTP preview checks
- `--skip-public-safety` — skip public route / registry / noindex HTTP checks

### 10.3 What dry-run validates

- Loads and validates
  `content/assessments/baseline-readiness/questions_v1.json` and
  `results_v1-internal.json` using shared validators.
- Enforces `assessmentType=baseline-readiness`, question-set CMS version `1`,
  schema version `2`, question IDs `br-q1`…`br-q5`, avatars
  `readiness-low|readiness-building|readiness-ready`, result-pack version
  `v1-internal`, and `channels.email/pdf.enabled=false`.
- Prints planned CMS operations (save-json, create pack identities, save pack
  revisions) **without calling write APIs**.
- Emits a markdown QA report with go/no-go recommendation.

### 10.4 Forced-preview checks

When `--base-url` is set, the operator checks all three URLs (via HTTP):

- `/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low`
- `…forceOutcome=readiness-building`
- `…forceOutcome=readiness-ready`

It also calls `/api/results-packs/resolve?…&preview=1` per level to confirm
Flow v2 pack structure. **`preview=1` is required** for preview-pointer-only
packs; published packs also resolve without `preview=1`. The resolver honors
`preview=1` only for editor/admin roles (`canPreview`), so staged content cannot
leak publicly. Admin preview routes require `BASELINE_READINESS_QA_ADMIN_COOKIE`
for auth. Visual QA (screenshots, CTA/video placeholder acceptance) remains
manual — see §5.

Public safety checks (when not skipped) confirm guarded activation posture:

- Registry status `active`
- Public slug routable
- `/assessments/baseline-readiness` reachable (not 404)
- Robots meta includes `noindex`
- Downstream artifacts disabled in-repo

### 10.5 Refusal / safety conditions

The operator **refuses apply mode** when:

- `--environment` is missing or is `production` / `prod` / `live`
- `--base-url` is missing or matches production host patterns
- `--confirm-staging-write` is missing
- `BASELINE_READINESS_QA_ADMIN_COOKIE` is missing
- Target content is not internal (`v1-internal`)

The operator **never**:

- Changes registry status or SEO/noindex posture
- Approves public marketing launch
- Calls submission, email, PDF, webhook, or claim endpoints
- Stores secrets in repo or logs

### 10.6 What still requires manual admin review

- Placeholder CTA / video acceptance (§1.4)
- Formatted question-set preview and per-pack admin preview (§3.5, §4.4)
- Evidence table capture (§6)
- Publish button clicks in admin UI if you prefer UI over `--publish-revisions`
- Screenshot / visual forced-preview sign-off (§5.2)

Run targeted tests:

```bash
npm test -- baselineReadinessStagingQaOperator
npm test -- outboxMetricsFilter
npm test -- resolveResultsContentVersion buildResultsPackResolveQuery
```

---

## 11. Guarded activation status (post–Packet X4)

Guarded activation is **complete**. Baseline Readiness is operationally live with
direct-link access. This is separate from public marketing launch approval.

| Surface | Status after X4 |
| --- | --- |
| Registry `draft` → `active` | **Done** (guarded activation) |
| SEO / indexing | **index,follow** after X7 deploy — in sitemap |
| Public route `/assessments/baseline-readiness` | **Live** — catalog + direct link |
| CMS question set + result packs | Production-verified (manual QA ongoing) |
| Forced preview (all three levels) | Manual QA |
| Public `ResultsScreen` resolves `v1-internal` | Code (X1) + production-verified |
| Downstream artifacts | **Disabled** (email, PDF, webhook, claim, account-save) |
| Result-pack CTAs / video | **Resolved (X5b)** — V1 test-candidate packs rev 2; `/the-fine-diet-method`; no-video |
| `copyVersion` | **`v1`** — published CMS rev 3 (X6.1, 2026-07-09) |
| Launch content (X6 + X6.1) | **GO** — Rashad / human-founder, 2026-07-08; CMS `v1` republish 2026-07-09 |
| Public marketing launch (X7) | **GO in code** — Rashad / human-founder, 2026-07-09; deploy to verify |
| Catalog listing (`catalogVisible`) | **Visible** — listed on `/assessments` |

Admin delivery metrics support optional `?assessment_type=` filtering on
`GET /api/admin/metrics/outbox` (`gut-check` or `baseline-readiness`) for
14-day submission and outbox series.

---

## 12. Public marketing launch checklist

**Marketing launch GO recorded (X7, 2026-07-09).** Code flip complete; deploy to
verify production HTTP. Artifacts remain deferred to X8.

### 12.1 Content and CMS

Record per-pack approvals in
[`baseline-readiness-content-approval-matrix.md`](./baseline-readiness-content-approval-matrix.md)
(X5a / **X6 launch-content sign-off**) before launch flip.

- [x] X6 launch-content matrix complete (scoring, `copyVersion`, question set, result packs, video, artifacts) — Rashad / human-founder, 2026-07-08
- [x] Final result-pack copy approved (no `(placeholder)` CTAs)
- [x] `copyVersion` bumped to launch string `v1` — X6.1 CMS republish rev 3 (2026-07-09)
- [x] Video strategy confirmed — explicit no-video for launch
- [x] Forced preview passes for `readiness-low`, `readiness-building`, `readiness-ready` (X5b/X5c)
- [x] Live results path verified end-to-end (X5d, X6.1)

### 12.2 Downstream artifacts (X8 — not approved at launch)

- [ ] Email summary path configured and tested
- [ ] PDF download path configured and tested
- [ ] n8n webhook routing configured and tested
- [ ] Guest claim flow enabled and tested
- [ ] Save-to-account enabled and tested

**Intentionally disabled at X7 launch.** Enable only in a separate X8 packet.

### 12.3 SEO and discovery (X7 — code complete 2026-07-09)

- [x] Remove `noindex` override in `resolveAssessmentExperience` for `baseline-readiness`
- [x] Add `/assessments/baseline-readiness` and `/assessments` to sitemap via `listCatalogAssessments()`
- [x] Confirm `robots` allows indexing after deploy (`index,follow`)
- [x] Public catalog surface: `/assessments` lists Baseline via `catalogVisible: true`
- [ ] Nav/homepage/campaign deep links (optional follow-up — not required for X7 catalog GO)

### 12.4 Regression and sign-off

- [x] Gut Check smoke tests pass (unit + live E2E regression)
- [x] Baseline Readiness smoke tests pass (live E2E)
- [ ] Operations contract artifact statuses remain `not-implemented` until X8
- [x] Joint launch GO recorded — Rashad / human-founder, 2026-07-09 (X7)

**Public marketing launch: GO in code.** Deploy to production, then run post-deploy verification above.

---

## 9. Related docs

- [`baseline-readiness-cms-question-set.md`](./baseline-readiness-cms-question-set.md)
  — question-set CMS spec (Packet R).
- [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md)
  — result-pack authoring spec (Packet R).
- [`forced-result-preview.md`](./forced-result-preview.md) — forced-preview
  harness (Packet P / Q).
- [`adding-a-new-assessment.md`](./adding-a-new-assessment.md) — assessment
  registration and dual activation pattern.
- [`assessment-deployment-sop.md`](./assessment-deployment-sop.md) — reusable
  deployment SOP (Packet X9; Baseline proof path X4–X7).

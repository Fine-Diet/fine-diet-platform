# Baseline Readiness — Result Pack Drafts (Flow v2)

Packet R authoring spec for the three Baseline Readiness outcome result packs.
Copy is **provisional**, non-clinical, and readiness-framed. **Not published
to CMS** — repo specs only until manual CMS entry.

## Where specs live

| Artifact | Path |
| --- | --- |
| All three level packs (JSON) | [`content/assessments/baseline-readiness/results_v1-internal.json`](../../content/assessments/baseline-readiness/results_v1-internal.json) |
| Shared constants | [`lib/assessments/baselineReadiness/constants.ts`](../../lib/assessments/baselineReadiness/constants.ts) |
| Operations contract levels | [`lib/assessments/operationsContract.ts`](../../lib/assessments/operationsContract.ts) → `BASELINE_READINESS_CONTRACT` |
| Forced preview (QA) | [`docs/assessments/forced-result-preview.md`](./forced-result-preview.md) |

## Pack identity (CMS rows)

Create one `results_packs` row per level:

| assessment_type | results_version | level_id | slug (generated) |
| --- | --- | --- | --- |
| `baseline-readiness` | `v1-internal` | `readiness-low` | `baseline-readiness:v1-internal:readiness-low` |
| `baseline-readiness` | `v1-internal` | `readiness-building` | `baseline-readiness:v1-internal:readiness-building` |
| `baseline-readiness` | `v1-internal` | `readiness-ready` | `baseline-readiness:v1-internal:readiness-ready` |

`results_version` must match `BASELINE_READINESS_RESULTS_CONTENT_VERSION`
(`v1-internal`) and the forced-preview resolver query params.

## Level summaries

### readiness-low

| Field | Draft value |
| --- | --- |
| Label | Low readiness |
| Summary | User likely needs the most structure before starting — meal rhythm and observation habits need foundational work. |
| Framing | Supportive, no shame — "building the foundation" |
| Video | Placeholder YouTube URL — **replace before public launch** |
| CTA | `methodCtaLabel`: "Explore the Method (placeholder)" → `/method` |

**Flow v2 pages (provisional):**

- **Page 1:** Acknowledge variable meal rhythm; recommend structure before tracking.
- **Page 2:** Three steps — anchor meal, daily check-in, minimize simultaneous changes.
- **Page 3:** Fine Diet Method positioning; why structure precedes tracking.

### readiness-building

| Field | Draft value |
| --- | --- |
| Label | Building readiness |
| Summary | Partial habits forming — focus on consistency and rhythm before full guided tracking. |
| Framing | "Building momentum" — middle path |
| Video | Placeholder — replace before launch |
| CTA | Same placeholder pattern |

**Flow v2 pages (provisional):**

- **Page 1:** Partial habits present; consistency is the opportunity.
- **Page 2:** Lock strongest habit, add daily check-in, light observation.
- **Page 3:** Consistency beats intensity; Fine Diet sequencing.

### readiness-ready

| Field | Draft value |
| --- | --- |
| Label | Ready to start |
| Summary | Enough baseline structure to begin guided observation and tracking. |
| Framing | "Solid baseline" — ready for Method pathway |
| Video | Placeholder — replace before launch |
| CTA | "Start the Method (placeholder)" → `/method` |

**Flow v2 pages (provisional):**

- **Page 1:** Consistent rhythm and observation; ready to start guided tracking.
- **Page 2:** One-week observation log on existing rhythm.
- **Page 3:** No reset needed; Method builds on current structure.

## CMS field mapping (Flow v2)

Each pack's `content_json` follows the same structure as Gut Check Flow v2 packs.
Required fields are enforced by `validateResultsPack` — see
[`lib/resultsPack/validateResultsPack.ts`](../../lib/resultsPack/validateResultsPack.ts).

| Pack root field | CMS notes |
| --- | --- |
| `label` | Display title (maps to operations contract label) |
| `summary` | One-line outcome summary |
| `flow.page1.headline` | Page 1 headline |
| `flow.page1.body` | Array of paragraph strings |
| `flow.page1.snapshotBullets` | **Exactly 3** bullets |
| `flow.page1.meaningBody` | Required string |
| `flow.page2.stepBullets` | **Exactly 3** steps |
| `flow.page2.videoCtaLabel` | Video button label |
| `flow.page2.videoAssetUrl` | Valid YouTube URL (placeholder OK for draft) |
| `flow.page3.problemHeadline` | Page 3 headline |
| `flow.page3.tryBullets` | **Exactly 3** bullets |
| `flow.page3.mechanismPills` | **Exactly 4** pills |
| `flow.page3.methodLearnBullets` | **Exactly 3** bullets |
| `flow.page3.methodCtaLabel` | Primary CTA label |
| `flow.page3.methodCtaUrl` | CTA destination (placeholder `/method`) |
| `flow.page3.methodEmailLinkLabel` | Secondary email link label |
| `channels.email.enabled` | `false` until email routing exists |
| `channels.pdf.enabled` | `false` until PDF path exists |

Full draft JSON for each level is in
[`results_v1-internal.json`](../../content/assessments/baseline-readiness/results_v1-internal.json)
under `packs.readiness-low`, `packs.readiness-building`, `packs.readiness-ready`.

## How to manually enter and publish

1. Open **`/admin/results-packs`**.
2. Create pack identities for all three levels (table above) if they do not exist.
3. For each level, create a draft revision:
   - Copy the corresponding `packs.<level_id>` object from
     `results_v1-internal.json` as the revision `content_json`.
   - Run validation (admin UI or publish endpoint runs `validateResultsPack`).
4. Preview each pack at `/admin/results-packs/preview/[packId]`.
5. Publish all three revisions and set `published_revision_id` on each pointer.
6. QA forced preview:
   ```
   /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low
   /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-building
   /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-ready
   ```
   Each should render the 3-page Flow v2 content (no "missing pack" error).

## Publish prerequisites (per pack)

- [ ] Flow v2 structure passes `validateResultsPack`
- [ ] `label` and `summary` reviewed by product/content
- [ ] Placeholder video URLs replaced with real Baseline Readiness videos (or explicit "no video" decision documented)
- [ ] CTA labels and URLs finalized (not `/method` placeholder)
- [ ] `channels.email.enabled` remains `false` until Baseline Readiness email routing exists
- [ ] `channels.pdf.enabled` remains `false` until PDF path exists
- [ ] All **three** levels published at `v1-internal`

## What must be true before registry `active`

Baseline Readiness must **remain `draft`** until ALL of the following:

1. CMS question set v1 published (see [baseline-readiness-cms-question-set.md](./baseline-readiness-cms-question-set.md))
2. All three result packs published at `v1-internal`
3. Forced preview QA passes for all three levels
4. Internal runner QA with CMS question set (optional: compare to fixture)
5. Product sign-off on provisional scoring (or adapter updated)
6. Downstream artifacts configured if required (email/PDF — currently not implemented)
7. Engineering promotes `status: 'active'` in `assessmentRegistry.ts`

**Do not** flip registry status as part of CMS content entry alone.

## Missing result-pack requirements (today)

- [ ] No CMS rows exist yet for `baseline-readiness` / `v1-internal`
- [ ] Placeholder videos and CTAs need final URLs/copy
- [ ] Product/clinical review of readiness framing
- [ ] Email/PDF channels intentionally disabled until downstream packets

Forced preview **will** show "Could not load results pack" until packs are
published — this is expected and safe.

## Relationship to Packet Q

Packet Q wired runtime (adapter, mapper, forced preview, internal fixture).
Packet R adds **authoring artifacts** only — no runtime rewiring, no Supabase
writes, no registry promotion.

## Static validation

Repo tests in
[`lib/assessments/__tests__/baselineReadinessContentSpec.test.ts`](../../lib/assessments/__tests__/baselineReadinessContentSpec.test.ts)
confirm:

- Question-set spec IDs match internal fixture
- All three packs validate as Flow v2
- Level IDs match operations contract and outcome mapper
- Registry remains `draft`
- Gut Check unchanged

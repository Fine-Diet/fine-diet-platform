# Baseline Readiness — Content Approval Matrix (X5a)

Structured founder/editor decision record for Baseline Readiness result-pack
launch content. **Documentation and planning only** — this document does not
publish CMS content, change runtime behavior, or approve public marketing launch.

| Field | Value |
| --- | --- |
| Bridge packet | `f3870eda-88d7-4ed9-b791-1c04135e4d7e` |
| X5a.1 seed packet | `72c062b2-50fd-4e22-8f8a-5f3cc6370ae9` |
| X5 audit report | `f524887c-7e9d-4334-8c74-6529f159e60a` |
| Source spec | [`content/assessments/baseline-readiness/results_v1-internal.json`](../../content/assessments/baseline-readiness/results_v1-internal.json) |
| Question set (separate) | [`content/assessments/baseline-readiness/questions_v1.json`](../../content/assessments/baseline-readiness/questions_v1.json) |
| CMS publish runbook | [`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md) §12 |
| Result-pack spec | [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md) |

---

## Status and hard limits

**Guarded activation is live and production-verified.** Baseline Readiness is
operationally available at `/assessments/baseline-readiness` for direct-link use
with registry `active`.

**Public marketing launch remains NO-GO.** Until a separate launch-flip packet
and explicit joint GO, the following are **not** approved by filling in this
matrix:

- Removing `noindex,follow` or allowing search indexing
- Adding `/assessments/baseline-readiness` to the sitemap
- Enabling downstream artifacts (email, PDF, webhook, claim, account-save)
- Finalizing scoring (`baseline-readiness-total-score-v1-provisional` remains provisional)
- Marketing surfacing (nav, homepage, campaigns)
- Public marketing launch GO

Completing this matrix approves **content decisions only**. CMS copy swap,
forced-preview QA, and public launch flip are **later packets**.

---

## Current draft snapshot (repo spec — do not treat as approved)

All three packs in `results_v1-internal.json` share these placeholder patterns
today:

| Field | Current draft value (all packs unless noted) |
| --- | --- |
| `copyVersion` | `v1-internal-draft` |
| `videoAssetUrl` | `https://www.youtube.com/watch?v=ig61sqn2lyM` (test fixture; also used in `youtube.test.ts`) |
| `methodCtaUrl` | `/method` (**404 on production** as of X5 audit) |
| `methodEmailLinkLabel` | `Get updates (placeholder)` |
| `channels.email.enabled` | `false` |
| `channels.pdf.enabled` | `false` |

Per-pack placeholder labels today:

| Level | `videoCtaLabel` (draft) | `methodCtaLabel` (draft) |
| --- | --- | --- |
| `readiness-low` | Watch: Building meal rhythm (placeholder) | Explore the Method (placeholder) |
| `readiness-building` | Watch: From habits to rhythm (placeholder) | Explore the Method (placeholder) |
| `readiness-ready` | Watch: Starting guided observation (placeholder) | Start the Method (placeholder) |

**Question set:** `questions_v1.json` has no `(placeholder)` markers and appears
consumer-ready. Record a separate sign-off below if question copy should be
included in the same approval cycle.

---

## V1 passable test recommendations — pending founder/editor approval

> **Do not implement in CMS until approved.** Values below are a concrete test
> candidate for Rashad/editor review before X5b. Seeding this section does **not**
> approve X5b, public marketing launch, indexing, sitemap inclusion, artifacts,
> or final scoring.

**Packet:** `72c062b2-50fd-4e22-8f8a-5f3cc6370ae9`

### Global V1 candidate decisions

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `copyVersion` (all packs) | `v1-test-candidate` | ☐ No | _pending_ | _pending_ | Distinct from `v1-internal-draft`; not public-launch version |
| Video strategy | **No video** for V1 test candidate | ☐ No | _pending_ | _pending_ | Unless a real approved production video is provided |
| `videoAssetUrl` | **None / intentionally omitted** | ☐ No | _pending_ | _pending_ | **Not supported by validator today** — see [X5b implementation questions](#x5b-implementation-questions) |
| Placeholder fixture | **Do not use** `ig61sqn2lyM` | — | — | — | Test-only YouTube ID in repo spec |
| Method CTA URL (default) | `/the-fine-diet-method` | ☐ No | _pending_ | _pending_ | **200** on production (X5 audit) |
| `methodEmailLinkLabel` (default) | `Email me this plan` | ☐ No | _pending_ | _pending_ | Label only; email remains artifact-gated/disabled |
| Email artifact behavior | Keep disabled | ☐ No | _pending_ | _pending_ | `channels.email.enabled: false` until separate artifact packet |
| Scoring/outcome (global) | Accepted for **test candidate only** | ☐ No | _pending_ | _pending_ | `baseline-readiness-total-score-v1-provisional` — not final clinical/public-launch scoring |
| Public marketing launch | **NO-GO** | — | — | — | Unchanged |

### `readiness-low` — V1 test candidate

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Foundation Builder | ☐ No | _pending_ | _pending_ | |
| `summary` | Your current rhythm has a few useful signals, but the basics need more consistency before deeper tracking will feel helpful. Start with one simple meal rhythm and build from there. | ☐ No | _pending_ | _pending_ | |
| `firstFocusAreas` | Create a repeatable first meal; Add one reliable protein anchor; Notice the easiest time of day to improve | ☐ No | _pending_ | _pending_ | Replace draft `keyPatterns` / align in body copy during X5b |
| `methodPositioning` | Use the Method as a simple foundation-building path, not a strict overhaul. | ☐ No | _pending_ | _pending_ | |
| `methodCtaLabel` | Start with the Fine Diet Method | ☐ No | _pending_ | _pending_ | |
| `methodCtaUrl` | `/the-fine-diet-method` | ☐ No | _pending_ | _pending_ | |
| `methodEmailLinkLabel` | Email me this plan | ☐ No | _pending_ | _pending_ | UI hidden while artifacts disabled |
| Video strategy | No video | ☐ No | _pending_ | _pending_ | |
| `videoAssetUrl` | None (omitted) | ☐ No | _pending_ | _pending_ | Validator requires URL today |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☐ No | _pending_ | _pending_ | Validator still requires string if URL present |
| Body-copy direction | Calm, non-clinical, non-shaming. Low readiness = start smaller, not failure. | ☐ No | _pending_ | _pending_ | Revise flow page1–3 from draft JSON; keep existing structure |
| Scoring/outcome sign-off | Accepted for test candidate only | ☐ No | _pending_ | _pending_ | Not final clinical/public-launch scoring |

### `readiness-building` — V1 test candidate

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Rhythm Builder | ☐ No | _pending_ | _pending_ | |
| `summary` | You have a workable base. The next move is turning scattered healthy choices into a rhythm you can repeat on normal days, not just ideal ones. | ☐ No | _pending_ | _pending_ | |
| `firstFocusAreas` | Stabilize meal timing; Make protein and fiber easier to repeat; Track the patterns that change your energy and appetite | ☐ No | _pending_ | _pending_ | |
| `methodPositioning` | Use the Method to turn good instincts into a repeatable eating rhythm. | ☐ No | _pending_ | _pending_ | |
| `methodCtaLabel` | Build your rhythm with the Fine Diet Method | ☐ No | _pending_ | _pending_ | |
| `methodCtaUrl` | `/the-fine-diet-method` | ☐ No | _pending_ | _pending_ | |
| `methodEmailLinkLabel` | Email me this plan | ☐ No | _pending_ | _pending_ | |
| Video strategy | No video | ☐ No | _pending_ | _pending_ | |
| `videoAssetUrl` | None (omitted) | ☐ No | _pending_ | _pending_ | |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☐ No | _pending_ | _pending_ | |
| Body-copy direction | User is close, capable, ready for structured observation. Avoid overpromising outcomes. | ☐ No | _pending_ | _pending_ | |
| Scoring/outcome sign-off | Accepted for test candidate only | ☐ No | _pending_ | _pending_ | |

### `readiness-ready` — V1 test candidate

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Ready for Guided Observation | ☐ No | _pending_ | _pending_ | |
| `summary` | You are in a good position to use structured tracking and reflection. The next step is observing your patterns closely enough to make confident adjustments. | ☐ No | _pending_ | _pending_ | |
| `firstFocusAreas` | Track what you eat with context; Connect meals to energy, hunger, and consistency; Use weekly reflection to choose the next adjustment | ☐ No | _pending_ | _pending_ | |
| `methodPositioning` | Use the Method as a guided observation layer for users ready to learn from their own patterns. | ☐ No | _pending_ | _pending_ | |
| `methodCtaLabel` | Begin the Fine Diet Method | ☐ No | _pending_ | _pending_ | |
| `methodCtaUrl` | `/the-fine-diet-method` | ☐ No | _pending_ | _pending_ | |
| `methodEmailLinkLabel` | Email me this plan | ☐ No | _pending_ | _pending_ | |
| Video strategy | No video | ☐ No | _pending_ | _pending_ | |
| `videoAssetUrl` | None (omitted) | ☐ No | _pending_ | _pending_ | |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☐ No | _pending_ | _pending_ | |
| Body-copy direction | Readiness for guided practice, not perfection. Practical and test-oriented. | ☐ No | _pending_ | _pending_ | |
| Scoring/outcome sign-off | Accepted for test candidate only | ☐ No | _pending_ | _pending_ | |

### X5b implementation questions

Discovered while seeding the no-video V1 candidate (docs-only; no code changes in X5a.1):

| Question | Current behavior | Impact on V1 no-video candidate |
| --- | --- | --- |
| **Can `videoAssetUrl` be omitted?** | `validateResultsPack` requires a non-empty string that parses as YouTube (`lib/resultsPack/validateResultsPack.ts`). | CMS save/publish **fails** without a valid YouTube URL. |
| **Can Flow v2 render without video?** | `ResultsScreen` hides the video button when `videoUrl` is null (`videoUrl && …`), but `detectResultsFlow` treats `flow.page2.videoAssetUrl` as required for Flow v2 detection. | Runtime could hide the button, but pack may not pass validation or may not qualify as Flow v2 if fields are empty. |
| **Recommended X5b path for no-video** | Choose one before CMS copy swap: (a) relax validator + flow detection for optional video (small engineering packet), (b) supply a **real approved** Fine Diet YouTube URL per level or shared, (c) defer video block to a later content packet. | Do **not** reuse `ig61sqn2lyM` or invent a stub URL without approval. |

**Email label:** `Email me this plan` can be stored in CMS while `channels.email.enabled` remains `false` and `isOutputArtifactEnabled('baseline-readiness', 'email')` is `false` — the Method email link UI stays hidden until a separate artifact packet enables email.

---

## CTA and video destination decision record

Complete **once** before or alongside per-pack matrices. These decisions apply
unless a pack explicitly overrides in its matrix row.

### Method CTA destination (required)

Select **one** primary strategy. If level-specific routes are chosen, document
each pack in the matrix below.

| Option | Description | Production check (X5 audit) |
| --- | --- | --- |
| ☐ `/the-fine-diet-method` | Canonical on-site Method program page | **200** at `https://myfinediet.com/the-fine-diet-method` |
| ☐ External VSL | Off-site video sales letter or landing page (record full URL) | Verify URL, SSL, and redirect behavior |
| ☐ Level-specific routes | Different destination per outcome level | Document per pack in matrix |
| ☐ No Method CTA | Hide or omit primary Method button on page 3 | Requires UX/engineering confirmation |
| ☐ Other approved destination | Specify path or URL | Must return **200** (or documented redirect to 200) |

**Decision:**

| Field | Record here | V1 test candidate (pending approval) |
| --- | --- | --- |
| Selected option | _pending_ | `/the-fine-diet-method` |
| Canonical URL or path (if single destination) | _pending_ | `/the-fine-diet-method` |
| Rationale | _pending_ | On-site Method page returns 200; draft `/method` 404s |
| Approver | _pending_ | _pending_ |
| Date | _pending_ | _pending_ |
| **Approved for X5b?** | ☐ No | |

**Notes:** Draft packs use `/method`, which **404s** on production. Gut Check
`results_v2.json` also references `/method` — resolving Baseline does not fix
Gut Check; treat as a separate follow-up if desired.

### Video strategy (required)

| Option | Description |
| --- | --- |
| ☐ Per-level YouTube videos | Unique `videoAssetUrl` per pack (record in matrix) |
| ☐ Single shared video | One URL for all three packs |
| ☐ No video on page 2 | Explicit no-video UX; labels may change or video block hidden |
| ☐ Non-YouTube embed | Record provider and URL pattern; confirm `validateResultsPack` accepts URL |

**Decision:**

| Field | Record here | V1 test candidate (pending approval) |
| --- | --- | --- |
| Selected option | _pending_ | **No video on page 2** |
| Shared video URL (if applicable) | _pending_ | None — do not use `ig61sqn2lyM` |
| Approver | _pending_ | _pending_ |
| Date | _pending_ | _pending_ |
| **Approved for X5b?** | ☐ No | Blocked until validator/UX path resolved — see [X5b implementation questions](#x5b-implementation-questions) |

### Email link label (page 3 secondary)

Baseline artifacts are **disabled** today (`channels.email.enabled: false`).
This label only matters if artifacts are enabled in a **later** packet.

| Option | Description |
| --- | --- |
| ☐ Gut Check pattern | e.g. "Email me the link" (see Gut Check packs) |
| ☐ Waitlist / updates copy | e.g. newsletter or waitlist wording |
| ☐ Omit when artifacts disabled | Keep label in CMS but UI hidden until enablement |
| ☐ Other | Specify final string in per-pack matrix |

**Decision:**

| Field | Record here | V1 test candidate (pending approval) |
| --- | --- | --- |
| Selected option | _pending_ | **Omit when artifacts disabled** (label stored for later) |
| Default label (if shared across packs) | _pending_ | `Email me this plan` |
| Approver | _pending_ | _pending_ |
| Date | _pending_ | _pending_ |
| **Approved for X5b?** | ☐ No | Label-only; email artifact remains disabled |

---

## Per-pack approval matrix

Fill one row set per outcome level. **Do not** treat draft JSON values as
approved until approver and date are recorded. **V1 test candidate values** are
seeded in [§ V1 passable test recommendations](#v1-passable-test-recommendations--pending-foundereditor-approval) — all show **Approved for X5b? ☐ No** until founder/editor sign-off.

### `readiness-low`

| Decision field | Draft reference (repo) | Approved value | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `copyVersion` | `v1-internal-draft` | | | | Target production version string (e.g. `v1`) |
| Video strategy | Per CTA/video section | | | | Shared / per-level / no video |
| `videoAssetUrl` | `…/watch?v=ig61sqn2lyM` | | | | Must be valid YouTube URL if video enabled |
| `videoCtaLabel` | Watch: Building meal rhythm (placeholder) | | | | No `(placeholder)` in approved string |
| `methodCtaLabel` | Explore the Method (placeholder) | | | | |
| `methodCtaUrl` | `/method` | | | | Must resolve (not 404) |
| `methodEmailLinkLabel` | Get updates (placeholder) | | | | |
| Body-copy sign-off (flow page1–3) | Provisional — see JSON | ☐ Approved ☐ Revisions needed | | | Headlines, body arrays, bullets, pills, method blocks |
| Pack-level sign-off | `label`, `summary`, `keyPatterns`, `firstFocusAreas`, `methodPositioning` | ☐ Approved ☐ Revisions needed | | | |
| Scoring/outcome sign-off | Level maps to `readiness-low` via provisional adapter | ☐ Accepted provisional ☐ Revisions needed | | | Adapter: `baseline-readiness-total-score-v1-provisional` |

### `readiness-building`

| Decision field | Draft reference (repo) | Approved value | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `copyVersion` | `v1-internal-draft` | | | | |
| Video strategy | Per CTA/video section | | | | |
| `videoAssetUrl` | `…/watch?v=ig61sqn2lyM` | | | | |
| `videoCtaLabel` | Watch: From habits to rhythm (placeholder) | | | | |
| `methodCtaLabel` | Explore the Method (placeholder) | | | | |
| `methodCtaUrl` | `/method` | | | | |
| `methodEmailLinkLabel` | Get updates (placeholder) | | | | |
| Body-copy sign-off (flow page1–3) | Provisional — see JSON | ☐ Approved ☐ Revisions needed | | | |
| Pack-level sign-off | `label`, `summary`, `keyPatterns`, `firstFocusAreas`, `methodPositioning` | ☐ Approved ☐ Revisions needed | | | |
| Scoring/outcome sign-off | Level maps to `readiness-building` | ☐ Accepted provisional ☐ Revisions needed | | | |

### `readiness-ready`

| Decision field | Draft reference (repo) | Approved value | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `copyVersion` | `v1-internal-draft` | | | | |
| Video strategy | Per CTA/video section | | | | |
| `videoAssetUrl` | `…/watch?v=ig61sqn2lyM` | | | | |
| `videoCtaLabel` | Watch: Starting guided observation (placeholder) | | | | |
| `methodCtaLabel` | Start the Method (placeholder) | | | | |
| `methodCtaUrl` | `/method` | | | | |
| `methodEmailLinkLabel` | Get updates (placeholder) | | | | |
| Body-copy sign-off (flow page1–3) | Provisional — see JSON | ☐ Approved ☐ Revisions needed | | | |
| Pack-level sign-off | `label`, `summary`, `keyPatterns`, `firstFocusAreas`, `methodPositioning` | ☐ Approved ☐ Revisions needed | | | |
| Scoring/outcome sign-off | Level maps to `readiness-ready` | ☐ Accepted provisional ☐ Revisions needed | | | |

### Question set (optional same-cycle sign-off)

| Artifact | Draft reference | Sign-off | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `questions_v1.json` | 5 questions, no placeholders | ☐ Approved ☐ Revisions needed | | | CMS identity: `baseline-readiness` v1 |

---

## Launch gate summary (separate decisions)

Each gate must be explicitly **GO** before public marketing launch. Filling the
content matrix does **not** satisfy any gate except **Content approval (partial)**.

| Gate | Owner | Current status | Launch requirement |
| --- | --- | --- | --- |
| **Content approval** | Founder/editor | **NO-GO** — placeholders remain | This matrix complete; no `(placeholder)` in approved CMS revisions |
| **SEO / indexing** | Marketing + engineering | **NO-GO** — `noindex,follow` | Explicit decision; code change in `resolveAssessmentExperience` |
| **Sitemap** | Marketing + engineering | **NO-GO** — route excluded | Explicit decision; sitemap or CMS SEO update |
| **Artifacts** | Engineering | **NO-GO** — all disabled | Enable email/PDF/webhook/claim/account-save only in dedicated packets |
| **Scoring** | Product/clinical | **NO-GO** — provisional adapter | Sign-off or adapter update |
| **Marketing surfaces** | Marketing | **NO-GO** | Nav, homepage, campaigns |
| **Public marketing launch GO** | Joint | **NO-GO** | All gates above + runbook §12 evidence table |

---

## Implementation readiness (after matrix is filled)

Work proceeds in order. **Do not skip ahead to public launch.**

1. **Founder/editor completes this matrix** — all required fields, approver, date.
2. **X5b (recommended next packet): CMS copy swap** — apply approved values to
   CMS draft revisions for all three packs (and question set if revised). Do not
   change `results_v1-internal.json` until repo spec is intentionally updated to
   match approved CMS content.
3. **Forced-preview QA** — required after CMS revisions:
   - `/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low`
   - `/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-building`
   - `/admin/assessments/baseline-readiness/preview?forceOutcome=readiness-ready`
4. **Live results E2E** — verify
   `/assessments/baseline-readiness?submission_id=…` with published packs.
5. **Launch flip packet (later)** — SEO, sitemap, artifacts, marketing surfaces,
   joint GO per [`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md) §12.

**CMS publish** of revised content is **X5b or later**, not X5a.

---

## Matrix completion checklist

Before handing to engineering for CMS copy swap:

- [ ] V1 test candidate reviewed; each pack and global row marked **Approved for X5b? ☑ Yes** where applicable
- [ ] CTA/video destination section complete (Method + video + email label strategy)
- [ ] All three per-pack tables filled (approved values, approver, date)
- [ ] No approved string contains `(placeholder)`
- [ ] Every approved `methodCtaUrl` verified **200** (or documented redirect)
- [ ] No-video path resolved in X5b if video omitted (validator/UX — see implementation questions)
- [ ] Every approved `videoAssetUrl` verified (if video enabled)
- [ ] Body-copy and pack-level sign-offs checked **Approved** or revisions tracked
- [ ] Scoring/outcome sign-off recorded (test-candidate accept or revision ticket)
- [ ] Public marketing launch still understood as **NO-GO**

---

## Related docs

- [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md) — Flow v2 field mapping and pack identities
- [`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md) — CMS operations and §12 marketing launch checklist
- [`forced-result-preview.md`](./forced-result-preview.md) — forced-preview QA URLs

# Baseline Readiness — Content Approval Matrix (X5a)

Structured founder/editor decision record for Baseline Readiness result-pack
launch content. **Documentation and planning only** — this document does not
publish CMS content, change runtime behavior, or approve public marketing launch.

| Field | Value |
| --- | --- |
| Bridge packet | `f3870eda-88d7-4ed9-b791-1c04135e4d7e` |
| X5a.1 seed packet | `72c062b2-50fd-4e22-8f8a-5f3cc6370ae9` |
| Founder/editor approval (X5b prep) | `6dd1bfed-885d-4cf6-9260-6b1afa4c6520` |
| X5b packet | `daa5e2c0-6249-44eb-acfb-1a5cf03b49af` |
| PR #136 pre-merge forced-preview waiver | Rashad / human-founder — 2026-07-08 (engineering merge only) |
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

## V1 passable test recommendations — founder/editor approved for X5b prep

> **Approved for X5b CMS copy-swap test candidate only.** Rashad / human-founder
> approved all V1 values below on 2026-07-08. **Do not implement in CMS until the
> X5b packet runs.** This approval does **not** approve public marketing launch,
> indexing, sitemap inclusion, artifacts, or final clinical scoring.

**Packet:** `72c062b2-50fd-4e22-8f8a-5f3cc6370ae9` · **Approval:** `6dd1bfed-885d-4cf6-9260-6b1afa4c6520`

### Global V1 candidate decisions

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `copyVersion` (all packs) | `v1-test-candidate` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Distinct from `v1-internal-draft`; not public-launch version |
| Video strategy | **No video** for V1 test candidate | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Unless a real approved production video is provided |
| `videoAssetUrl` | **None / intentionally omitted** | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. **Not supported by validator today** — see [X5b implementation questions](#x5b-implementation-questions). Do not use `ig61sqn2lyM` |
| Placeholder fixture | **Do not use** `ig61sqn2lyM` | — | — | — | Test-only YouTube ID in repo spec |
| Method CTA URL (default) | `/the-fine-diet-method` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. **200** on production (X5 audit) |
| `methodEmailLinkLabel` (default) | `Email me this plan` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Label only; email remains artifact-gated/disabled |
| Email artifact behavior | Keep disabled | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. `channels.email.enabled: false` until separate artifact packet |
| Scoring/outcome (global) | Accepted for **test candidate only** | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. `baseline-readiness-total-score-v1-provisional` — not final clinical/public-launch scoring |
| Public marketing launch | **NO-GO** | — | — | — | Unchanged |

### `readiness-low` — V1 test candidate (Foundation Builder)

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Foundation Builder | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `summary` | Your current rhythm has a few useful signals, but the basics need more consistency before deeper tracking will feel helpful. Start with one simple meal rhythm and build from there. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `firstFocusAreas` | Create a repeatable first meal; Add one reliable protein anchor; Notice the easiest time of day to improve | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Replace draft `keyPatterns` / align in body copy during X5b |
| `methodPositioning` | Use the Method as a simple foundation-building path, not a strict overhaul. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaLabel` | Start with the Fine Diet Method | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaUrl` | `/the-fine-diet-method` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodEmailLinkLabel` | Email me this plan | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. UI hidden while artifacts disabled |
| Video strategy | No video | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. See [X5b implementation questions](#x5b-implementation-questions) |
| `videoAssetUrl` | None (omitted) | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Validator requires URL today; do not use `ig61sqn2lyM` |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Body-copy direction | Calm, non-clinical, non-shaming. Low readiness = start smaller, not failure. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Revise flow page1–3 from draft JSON; keep existing structure |
| Scoring/outcome sign-off | Accepted for test candidate only | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Not final clinical/public-launch scoring |

### `readiness-building` — V1 test candidate (Rhythm Builder)

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Rhythm Builder | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `summary` | You have a workable base. The next move is turning scattered healthy choices into a rhythm you can repeat on normal days, not just ideal ones. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `firstFocusAreas` | Stabilize meal timing; Make protein and fiber easier to repeat; Track the patterns that change your energy and appetite | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodPositioning` | Use the Method to turn good instincts into a repeatable eating rhythm. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaLabel` | Build your rhythm with the Fine Diet Method | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaUrl` | `/the-fine-diet-method` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodEmailLinkLabel` | Email me this plan | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Video strategy | No video | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. See [X5b implementation questions](#x5b-implementation-questions) |
| `videoAssetUrl` | None (omitted) | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Do not use `ig61sqn2lyM` |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Body-copy direction | User is close, capable, ready for structured observation. Avoid overpromising outcomes. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Scoring/outcome sign-off | Accepted for test candidate only | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |

### `readiness-ready` — V1 test candidate (Ready for Guided Observation)

| Field | V1 test candidate value | Approved for X5b? | Approver | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| `label` | Ready for Guided Observation | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `summary` | You are in a good position to use structured tracking and reflection. The next step is observing your patterns closely enough to make confident adjustments. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `firstFocusAreas` | Track what you eat with context; Connect meals to energy, hunger, and consistency; Use weekly reflection to choose the next adjustment | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodPositioning` | Use the Method as a guided observation layer for users ready to learn from their own patterns. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaLabel` | Begin the Fine Diet Method | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodCtaUrl` | `/the-fine-diet-method` | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| `methodEmailLinkLabel` | Email me this plan | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Video strategy | No video | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. See [X5b implementation questions](#x5b-implementation-questions) |
| `videoAssetUrl` | None (omitted) | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Do not use `ig61sqn2lyM` |
| `videoCtaLabel` | _N/A — no video for V1 candidate_ | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Body-copy direction | Readiness for guided practice, not perfection. Practical and test-oriented. | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |
| Scoring/outcome sign-off | Accepted for test candidate only | ☑ Yes | Rashad / human-founder | 2026-07-08 | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |

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

| Field | Record here | V1 test candidate (approved for X5b prep) |
| --- | --- | --- |
| Selected option | `/the-fine-diet-method` | `/the-fine-diet-method` |
| Canonical URL or path (if single destination) | `/the-fine-diet-method` | `/the-fine-diet-method` |
| Rationale | On-site Method page returns 200; draft `/method` 404s | On-site Method page returns 200; draft `/method` 404s |
| Approver | Rashad / human-founder | Rashad / human-founder |
| Date | 2026-07-08 | 2026-07-08 |
| **Approved for X5b?** | ☑ Yes | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. |

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

| Field | Record here | V1 test candidate (approved for X5b prep) |
| --- | --- | --- |
| Selected option | **No video on page 2** | **No video on page 2** |
| Shared video URL (if applicable) | None — do not use `ig61sqn2lyM` | None — do not use `ig61sqn2lyM` |
| Approver | Rashad / human-founder | Rashad / human-founder |
| Date | 2026-07-08 | 2026-07-08 |
| **Approved for X5b?** | ☑ Yes | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Resolve no-video path in X5b — see [X5b implementation questions](#x5b-implementation-questions) |

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

| Field | Record here | V1 test candidate (approved for X5b prep) |
| --- | --- | --- |
| Selected option | **Omit when artifacts disabled** (label stored for later) | **Omit when artifacts disabled** (label stored for later) |
| Default label (if shared across packs) | `Email me this plan` | `Email me this plan` |
| Approver | Rashad / human-founder | Rashad / human-founder |
| Date | 2026-07-08 | 2026-07-08 |
| **Approved for X5b?** | ☑ Yes | Approved for X5b CMS copy-swap test candidate only. Public marketing launch remains NO-GO. Label-only; email artifact remains disabled |

---

## Per-pack approval matrix

Fill one row set per outcome level. **Do not** treat draft JSON values as
approved until approver and date are recorded. **V1 test candidate values** are
seeded in [§ V1 passable test recommendations](#v1-passable-test-recommendations--foundereditor-approved-for-x5b-prep) — **Approved for X5b? ☑ Yes** (Rashad / human-founder, 2026-07-08) for X5b CMS copy-swap test candidate only.

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
| **Content approval (X5b test candidate)** | Founder/editor | **GO for X5b prep** — V1 values approved 2026-07-08 | CMS copy swap per matrix; no `(placeholder)` in revisions |
| **SEO / indexing** | Marketing + engineering | **NO-GO** — `noindex,follow` | Explicit decision; code change in `resolveAssessmentExperience` |
| **Sitemap** | Marketing + engineering | **NO-GO** — route excluded | Explicit decision; sitemap or CMS SEO update |
| **Artifacts** | Engineering | **NO-GO** — all disabled | Enable email/PDF/webhook/claim/account-save only in dedicated packets |
| **Scoring** | Product/clinical | **NO-GO** — provisional adapter | Sign-off or adapter update |
| **Marketing surfaces** | Marketing | **NO-GO** | Nav, homepage, campaigns |
| **Public marketing launch GO** | Joint | **NO-GO** | All gates above + runbook §12 evidence table |

---

## Implementation readiness (after matrix is filled)

Work proceeds in order. **Do not skip ahead to public launch.**

1. **Founder/editor approved V1 test candidate for X5b prep** (2026-07-08, Rashad / human-founder). **X5b packet** applies approved values to CMS.
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

## PR #136 pre-merge forced-preview waiver (narrow — engineering only)

**Approver:** Rashad / human-founder · **Date:** 2026-07-08 · **PR:** [#136](https://github.com/Fine-Diet/fine-diet-platform/pull/136)

Pre-merge forced-preview QA could not verify approved V1 result packs because
preview resolution is **CMS-first** and published CMS still contains placeholder
packs. V1 no-video CMS content must not be applied until PR #136 code (optional
Flow v2 video) is merged and deployed.

**Merge blocker (waived):** `059c87af-f3b1-4723-af69-61673ca280a5` · **QA report:** `c481ac4a-22de-4b85-876d-99f8e9a12036`

### Waiver approves

- Merge PR #136 engineering changes only (no-video support + file-backed V1 test candidate spec in repo).

### Waiver does not approve

- Public marketing launch
- Indexing or sitemap inclusion
- Artifacts (email, PDF, webhook, claim, account-save)
- Treating production CMS as updated

### Post-merge required before X5b closeout

1. Deploy merged PR #136 code.
2. CMS apply or manual admin publish (separate approval) so preview/staging resolve serves approved V1 test candidate values.
3. Re-run forced-preview QA for `readiness-low`, `readiness-building`, `readiness-ready`.

**Public marketing launch remains NO-GO.**

---

## Matrix completion checklist

Before handing to engineering for CMS copy swap:

- [x] V1 test candidate reviewed; each pack and global row marked **Approved for X5b? ☑ Yes** (2026-07-08)
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

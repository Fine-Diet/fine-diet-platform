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
| X5c packet | `1e2f4ea1-89a1-4b25-a8dd-10bab73e59b4` |
| X5d packet | `f6b55849-cf1e-4100-9450-a087134a01c1` |
| X5e packet | `9cd34a06-5d1c-4521-bafe-c581ce7a4a96` |
| X5c audit date | 2026-07-09 |
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
| **Content approval (X5b test candidate)** | Founder/editor | **GO** — V1 packs published CMS rev 2 (2026-07-08) | Forced-preview + resolve API PASS 2026-07-09 |
| **SEO / indexing** | Marketing + engineering | **NO-GO** — `noindex,follow` | Explicit decision; code change in `resolveAssessmentExperience` |
| **Sitemap** | Marketing + engineering | **NO-GO** — route excluded | Explicit decision; sitemap or CMS SEO update |
| **Artifacts** | Engineering | **NO-GO** — all disabled | Enable email/PDF/webhook/claim/account-save only in dedicated packets |
| **Scoring** | Product/clinical | **NO-GO** — provisional adapter | Sign-off or adapter update |
| **Marketing surfaces** | Marketing | **NO-GO** — catalog hidden (X5e) | Nav/homepage/campaigns; `/assessments` uses `listCatalogAssessments` — Baseline `catalogVisible: false` |
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

1. ~~Deploy merged PR #136 code.~~ **Done** — production deploy `4547e9d` READY.
2. ~~CMS apply or manual admin publish (separate approval)~~ **Done** — 2026-07-08 Rashad-approved V1 result packs published (revision 2 per level; question set untouched).
3. ~~Re-run forced-preview QA for `readiness-low`, `readiness-building`, `readiness-ready`.~~ **Done** — staging QA report `baseline-readiness-qa-2026-07-09T00-42-54-493Z.md` PASS (Foundation Builder / Rhythm Builder / Ready for Guided Observation).

**Public marketing launch remains NO-GO.**

---

## X5c launch-readiness gate audit (2026-07-09)

Packet `1e2f4ea1-89a1-4b25-a8dd-10bab73e59b4` — audit-only; no launch flip, no CMS
republish, no guardrail changes.

### Production CMS snapshot (published pointers)

| Level | Rev | Label | `copyVersion` | `methodCtaUrl` | `videoAssetUrl` | Email/PDF |
| --- | --- | --- | --- | --- | --- | --- |
| `readiness-low` | 2 | Foundation Builder | `v1-test-candidate` | `/the-fine-diet-method` | omitted (null) | disabled |
| `readiness-building` | 2 | Rhythm Builder | `v1-test-candidate` | `/the-fine-diet-method` | omitted (null) | disabled |
| `readiness-ready` | 2 | Ready for Guided Observation | `v1-test-candidate` | `/the-fine-diet-method` | omitted (null) | disabled |

**Placeholder check:** No `/method` or `ig61sqn2lyM` in published CMS packs. Repo draft
`results_v1-internal.json` is aligned to V1 test-candidate values (file-backed spec only).

### Gate table

| Area | Status | Evidence / notes |
| --- | --- | --- |
| **Content (CMS result packs)** | **GO** | All three V1 test-candidate packs published; no `(placeholder)` strings; Method CTA `/the-fine-diet-method` **200**; no-video Flow v2 supported (PR #136). |
| **CMS operations** | **GO** | Question set v1 published (rev 1); result packs rev 2 published; forced-preview resolve API PASS all levels. |
| **Routing / guarded access** | **GO** | Registry `active`; `/assessments/baseline-readiness` **200**; direct-link + runner + `?submission_id=` path live. |
| **SEO (guarded posture)** | **GO** | Production robots includes `noindex`; override in `resolveAssessmentExperience` unchanged. |
| **Sitemap exclusion** | **GO** | `baseline-readiness` absent from `sitemap.xml`; generator excludes `noindex` routes. |
| **Artifacts** | **NO-GO** | Email, PDF, webhook, claim, account-save remain `not-implemented` in operations contract; UI gated via `isOutputArtifactEnabled`. Separate packet required to enable any. |
| **Scoring / outcomes** | **NO-GO** | `baseline-readiness-total-score-v1-provisional` — accepted for test candidate only; final clinical/public sign-off not recorded. |
| **Question set** | **VERIFY** | `questions_v1.json` has no placeholders; CMS v1 published; optional same-cycle founder sign-off row still unchecked in matrix. |
| **Analytics / events** | **VERIFY** | Generic assessment events fire (`assessment_started`, `assessment_completed`, etc.); 10 submissions in last 7 days; no Baseline-specific monitoring runbook beyond outbox `?assessment_type=` filter. |
| **Admin / operator docs** | **VERIFY** | Runbook + matrix exist; runbook §11 still says placeholder CTAs are a **blocker** (stale post-X5b); operations contract still lists ResultsScreen as `not-implemented` (doc drift — runtime works). |
| **Public marketing surfaces** | **NO-GO** | No homepage/nav/campaign links. **X5e:** `/assessments` catalog hidden via `catalogVisible: false`; `/account/start` → `/assessments` shows Gut Check only. Direct link unchanged. |
| **Live results E2E** | **GO** | X5d live E2E PASS all three outcomes (2026-07-09); report `baseline-readiness-live-e2e-2026-07-09T01-35-51-388Z.md` |
| **Gut Check regression** | **GO** | `/assessments/gut-check` `index,follow`; no assessment routes in sitemap; Gut Check artifacts/behavior unchanged. |

### Blockers vs optional polish

**Blockers (public marketing launch):**

- Joint marketing launch GO not granted
- Scoring remains provisional (not final clinical/public)
- Artifacts disabled (by design until separate packet)
- `copyVersion` still `v1-test-candidate` (not launch version string e.g. `v1`)
- Marketing surfaces / catalog exposure policy undecided
- Question set optional sign-off not recorded

**Optional polish (guarded/direct-link):**

- Complete runbook §6 evidence table (visual forced-preview screenshots)
- Refresh runbook §11 and operations contract artifact statuses (doc drift)
- Decide catalog gating: hide Baseline on `/assessments` until launch flip

### Recommended next packet sequence

1. **X5d — Live results E2E visual QA** — complete evidence table §6; confirm ResultsScreen page 1–3 + Method CTA for all three live `submission_id` outcomes.
2. **X5e — Marketing-surface policy** — founder decision on `/assessments` catalog + `/account/start` exposure during guarded phase; implement filter if NO.
3. **X6 — Launch-content sign-off** — final scoring acceptance or adapter update; `copyVersion` → `v1`; question set sign-off; video strategy for launch (real URLs or explicit no-video).
4. **X7 — Launch flip** — remove `noindex`, add sitemap entry, enable approved marketing surfaces (only after X6 GO).
5. **X8 — Artifacts packet** (optional, separate) — enable email/PDF/webhook/claim/account-save per runbook §12.2.

**Public marketing launch recommendation: NO-GO** (unchanged).

---

## X5d live results E2E closeout (2026-07-09)

Packet `f6b55849-cf1e-4100-9450-a087134a01c1` · Intent `4f717896-ee9b-4edc-92b2-6932153af912`

### Pass/fail by outcome

| Outcome | Submission ID | Status | Public URL |
| --- | --- | --- | --- |
| `readiness-low` | `d918fcf0-ded6-4792-b89e-f0dd38373f27` | **PASS** | https://myfinediet.com/assessments/baseline-readiness?submission_id=d918fcf0-ded6-4792-b89e-f0dd38373f27 |
| `readiness-building` | `51bf16c8-c9c2-4f7f-a7ed-90634fef14aa` | **PASS** | https://myfinediet.com/assessments/baseline-readiness?submission_id=51bf16c8-c9c2-4f7f-a7ed-90634fef14aa |
| `readiness-ready` | `1c92ade1-608f-490c-a429-88c25ff64623` | **PASS** | https://myfinediet.com/assessments/baseline-readiness?submission_id=1c92ade1-608f-490c-a429-88c25ff64623 |

### Verified per outcome

- Correct pack label (Foundation Builder / Rhythm Builder / Ready for Guided Observation)
- Method CTA label matches V1 test-candidate matrix
- Method CTA URL `/the-fine-diet-method` (**200**)
- `videoUrl` null via `resolveResultsScreenContent` (no video button)
- Artifacts disabled (`email`, `pdf`, `claim`, `account-save`)
- Public route **200** with `noindex`
- Flow v2 multi-page content resolves (page1 headline present)

### Gut Check regression

**PASS** — cover indexable; pack resolve OK; Baseline not in sitemap.

### X5d closeout recommendation

**GO** for guarded/direct-link live results E2E evidence. **Public marketing launch remains NO-GO.**

Operator: `npm run assessments:baseline-readiness:live-e2e`

### Gaps vs future reusable assessment launch template

| Gap | Baseline today | Template should require |
| --- | --- | --- |
| Results E2E verification | Custom X5d script chains API + pure resolver | Standard `live-e2e` npm script per assessment slug |
| Client-rendered results | SSR HTML empty; content verified via resolver chain | Document CSR limitation; optional Playwright visual step |
| Marketing catalog exposure | `listActiveAssessments()` auto-lists active registry entries | Explicit marketing-surface allowlist before guarded launch |
| Operations contract accuracy | ResultsScreen listed `not-implemented` (stale) | Post-activation contract sync checklist |
| Scoring sign-off | Provisional adapter accepted for test candidate only | Separate clinical/public scoring gate before launch flip |
| `copyVersion` naming | `v1-test-candidate` in production CMS | Bump to launch version string in pre-flip packet |
| Forced preview vs live E2E | Separate admin harness + public submission path | Both required in SOP: forced-preview + live `submission_id` per level |

### Reusable SOP checks (extracted from X5d)

Required steps for future assessment onboarding / public-launch SOP:

1. **Per-outcome live submission** — at least one real `submission_id` per result level.
2. **Submission API** — `primary_avatar` and `assessment_type` match expected level.
3. **Published pack resolve** — label, Method CTA URL/label, `videoAssetUrl` posture match approved matrix.
4. **ResultsScreen resolver chain** — `detectResultsFlow` + `resolveResultsScreenContent` produce expected page1–3 fields and `videoUrl`.
5. **Artifact gate** — `isOutputArtifactEnabled` false for all disabled artifacts; confirm UI would hide email/PDF/claim/account-save.
6. **Public results route** — `?submission_id=` returns **200** and `noindex` (guarded phase).
7. **CTA destination HTTP** — Method (or approved) destination returns **200**.
8. **Placeholder scan** — no approved-blocklist values (`/method`, test YouTube IDs) in pack or SSR HTML.
9. **Gut Check / sibling regression** — index posture unchanged; new assessment absent from sitemap until launch flip.
10. **Evidence table** — runbook §6.7-style row per outcome with submission IDs and report path.

### Recommended next packet

**X5e — Marketing-surface policy** (catalog/account/start exposure during guarded phase). Alternative: template/SOP draft packet if policy is deferred.

---

## X5e marketing-surface policy (2026-07-09)

Packet `9cd34a06-5d1c-4521-bafe-c581ce7a4a96`

### Policy decision

**Hide Baseline from public catalog until launch; preserve direct-link runtime.**

Runtime activation (`status: 'active'`) and catalog listing (`catalogVisible`) are
separate gates. Baseline Readiness remains runnable at `/assessments/baseline-readiness`
but is excluded from `/assessments` via `listCatalogAssessments()`.

### Surface inventory

| Surface | Before X5e | After X5e |
| --- | --- | --- |
| `/assessments` (index,follow) | Listed Baseline + Gut Check | Gut Check only |
| `/account/start` → `/assessments` | Indirect exposure | Gut Check only at catalog |
| `/assessments/baseline-readiness` direct link | Live, noindex | Unchanged |
| Nav / homepage / programs | No Baseline links | Unchanged |
| Sitemap | Baseline excluded | Unchanged |
| `listActiveAssessments()` | Both active | Unchanged (runtime) |

### Implementation

- `AssessmentRegistryEntry.catalogVisible` — Gut Check `true`, Baseline `false`
- `listCatalogAssessments()` — public catalog filter
- `/assessments` index uses `listCatalogAssessments()`

### Reusable template rule

**Runtime activation, catalog listing, SEO indexing, and sitemap inclusion must be separate launch gates.**

| Gate | Registry / code lever |
| --- | --- |
| Runnable (direct link) | `status: 'active'` |
| Catalog listing | `catalogVisible: true` |
| Search indexing | Remove per-slug `noindex` override |
| Sitemap | Add route when indexing approved |

### X5e closeout

**GO** — guarded catalog exposure closed. **Public marketing launch remains NO-GO.**

Launch flip (later): set `catalogVisible: true` alongside SEO/sitemap/marketing approval.

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

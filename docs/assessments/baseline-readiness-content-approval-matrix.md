# Baseline Readiness — Content Approval Matrix (X5a)

Structured founder/editor decision record for Baseline Readiness result-pack
launch content. **Documentation and planning only** — this document does not
publish CMS content, change runtime behavior, or approve public marketing launch.

| Field | Value |
| --- | --- |
| Bridge packet | `f3870eda-88d7-4ed9-b791-1c04135e4d7e` |
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

| Field | Record here |
| --- | --- |
| Selected option | _pending_ |
| Canonical URL or path (if single destination) | _pending_ |
| Rationale | _pending_ |
| Approver | _pending_ |
| Date | _pending_ |

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

| Field | Record here |
| --- | --- |
| Selected option | _pending_ |
| Shared video URL (if applicable) | _pending_ |
| Approver | _pending_ |
| Date | _pending_ |

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

| Field | Record here |
| --- | --- |
| Selected option | _pending_ |
| Default label (if shared across packs) | _pending_ |
| Approver | _pending_ |
| Date | _pending_ |

---

## Per-pack approval matrix

Fill one row set per outcome level. **Do not** treat draft JSON values as
approved until approver and date are recorded.

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

- [ ] CTA/video destination section complete (Method + video + email label strategy)
- [ ] All three per-pack tables filled (approved values, approver, date)
- [ ] No approved string contains `(placeholder)`
- [ ] Every approved `methodCtaUrl` verified **200** (or documented redirect)
- [ ] Every approved `videoAssetUrl` verified (if video enabled)
- [ ] Body-copy and pack-level sign-offs checked **Approved** or revisions tracked
- [ ] Scoring/outcome sign-off recorded (provisional accept or revision ticket)
- [ ] Public marketing launch still understood as **NO-GO**

---

## Related docs

- [`baseline-readiness-result-packs.md`](./baseline-readiness-result-packs.md) — Flow v2 field mapping and pack identities
- [`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md) — CMS operations and §12 marketing launch checklist
- [`forced-result-preview.md`](./forced-result-preview.md) — forced-preview QA URLs

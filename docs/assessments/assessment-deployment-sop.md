# Assessment Deployment SOP

Reusable standard operating procedure for taking a new Fine Diet assessment from
**premise intake** through **guarded release**, **content sign-off**, **CMS
publish**, **launch flip**, and **optional artifacts**.

**Packet:** X9 · `cc93978a-4ce8-4987-b99b-f76b5b3c7d7e`

**Proof path:** Baseline Readiness (`baseline-readiness`) — production launch GO
as of 2026-07-09 (X7 closeout). Gut Check remains the reference for a fully
artifact-enabled assessment.

This document is **docs-only guidance**. It does not change runtime behavior,
CMS content, registry posture, or scoring.

---

## 1. Purpose and scope

### What this SOP covers

- A **repeatable packet sequence** agents and engineers can follow for assessment #3+.
- **Independent launch gates** (runtime, catalog, SEO, sitemap, marketing surfaces,
  artifacts, CMS) so teams do not conflate “runnable” with “launched.”
- **Checklists**, **tests**, **evidence paths**, and **approval checkpoints**
  extracted from Baseline X4–X7 — not one-off packet noise.
- A **minimal future packet template** with placeholders for slug, outcomes, pack
  IDs, and launch flags.

### What this SOP does not cover

- Clinical or product strategy for *which* assessment to build next.
- Secrets, admin cookies, API keys, or Vercel bypass tokens (use env vars; never
  commit).
- Enabling artifacts without an explicit X8-style artifact packet.

### Related docs

| Doc | Role |
| --- | --- |
| [`adding-a-new-assessment.md`](./adding-a-new-assessment.md) | Registry, dual activation, Gut Check coupling |
| [`assessment-creation-manual.md`](./assessment-creation-manual.md) | Admin vs engineering ownership |
| [`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md) | Baseline CMS ops reference (Packet T) |
| [`baseline-readiness-content-approval-matrix.md`](./baseline-readiness-content-approval-matrix.md) | Baseline content sign-off reference (X5a–X7) |
| [`forced-result-preview.md`](./forced-result-preview.md) | Forced-preview QA pattern |
| [`scoring-dispatch.md`](./scoring-dispatch.md) / [`outcome-mapping.md`](./outcome-mapping.md) | Adapter + mapper requirements |

---

## 2. Independent launch gates

**Rule (from Baseline X5e):** Runtime activation, catalog listing, SEO
indexability, sitemap inclusion, marketing surfaces, artifact enablement, and
CMS publishing are **separate decisions**. Satisfying one gate must never imply
another.

| Gate | Question | Primary lever(s) | Typical when ON |
| --- | --- | --- | --- |
| **Runtime activation** | Can a user complete the assessment at a direct URL? | `ASSESSMENT_REGISTRY.status: 'active'`; scoring adapter; outcome mapper; CMS question set + packs published | Guarded direct-link QA (X4) |
| **CMS publishing** | Is authored content live in Supabase pointers? | Admin publish on question set + result packs | Before guarded QA |
| **Catalog listing** | Does `/assessments` show the card? | `catalogVisible: true` + `listCatalogAssessments()` | Launch flip (X7) |
| **SEO indexability** | Do cover/results routes allow indexing? | Remove per-slug `noindex` override in `resolveAssessmentExperience`; shared SEO pipeline | Launch flip (X7) |
| **Sitemap inclusion** | Is the route in `/sitemap.xml`? | `pages/sitemap.xml.tsx` + `listCatalogAssessments()` + `shouldExcludeRoute` | Launch flip (X7) |
| **Marketing surfaces** | Nav, homepage, campaigns, email footers? | Explicit product/marketing packet — **not** implied by catalog | Optional post-X7 |
| **Artifact enablement** | Email, PDF, webhook, claim, account-save, share? | `operationsContract` + `isOutputArtifactEnabled` + routing config | Separate X8 packet |

**Baseline at X7 closeout:**

| Gate | Baseline posture |
| --- | --- |
| Runtime | `active` — direct link live |
| CMS | Question set v1 + result packs rev 3 (`copyVersion: v1`) |
| Catalog | `catalogVisible: true` |
| SEO | `index,follow` (no override) |
| Sitemap | `/assessments` + `/assessments/baseline-readiness` |
| Marketing surfaces | `/assessments` catalog only — no nav/homepage links |
| Artifacts | All disabled — X8 deferred |

---

## 3. Lifecycle stages (durable sequence)

Map Baseline packet labels to **reusable stages**. Skip or merge stages only when
the assessment archetype truly does not need them (document why in the packet
template).

| Stage | Goal | Baseline proof (packets) | Owner |
| --- | --- | --- | --- |
| **A. Premise intake** | Problem point, archetype, audience, success criteria | J/K/L (factory, creation plan, wizard) | Product + admin planning |
| **B. Engineering scaffold** | Registry, adapter, mapper, contract, internal admin hub | Q, M/N/O | Engineering |
| **C. Question set + scoring** | Author + validate questions; register scoring adapter | R, S, M | Admin content + engineering |
| **D. Result packs** | Flow v2 packs per outcome; placeholder policy documented | R, X5b | Admin content |
| **E. CMS publish** | Publish pointers in Supabase | T, U (dry-run) | Admin |
| **F. Guarded direct-link QA** | `status: active`, route live, **noindex**, not in catalog/sitemap | X4, X4a–X4d, X5e | Engineering + QA |
| **G. Catalog policy** | Explicit `catalogVisible: false` until launch | X5e | Engineering |
| **H. Content sign-off** | Founder/editor matrix: scoring, copy, media, artifacts | X5a, X6 | Founder/editor |
| **I. copyVersion v1 republish** | Bump launch version string in CMS only | X6.1 | Engineering operator |
| **J. Launch flip** | Index, sitemap, catalog | X7 | Engineering |
| **K. Post-deploy verification** | Production HTTP + live E2E | X7 verify | Engineering/agent |
| **L. Optional artifacts** | Enable downstream outputs | X8 (not run for Baseline) | Engineering + ops |
| **M. Closeout** | Matrix/runbook/SOP updates, packet IDs recorded | X6/X6.1/X7 | Agent + founder |

---

## 4. Reusable packet sequence

Use **lettered stages** above as packet themes. Name packets `<slug>-<stage>-<short-id>`
in branch/PR titles; record UUIDs in the assessment content matrix.

```
A  Premise intake          → planning doc / creation wizard export
B  Engineering scaffold   → registry + adapter + mapper + contract + admin hub
C  Question set + scoring → CMS spec JSON + validator + adapter tests
D  Result packs            → pack spec JSON + Flow v2 validation
E  CMS publish             → runbook execution + evidence table
F  Guarded activation      → status active + noindex + artifacts off
G  Catalog policy          → catalogVisible false (explicit hide)
H  Content sign-off        → approval matrix (no launch flip)
I  copyVersion republish   → mechanical CMS version bump
J  Launch flip              → noindex off + sitemap + catalogVisible true
K  Post-deploy verify       → live E2E + curl checks + deploy ID
L  Artifacts (optional)     → separate GO; never bundled into J
M  Closeout                 → docs + recommendation
```

**Baseline condensed timeline (reference only):**

| Order | Baseline packet | Stage |
| --- | --- | --- |
| 1 | Q (internal proof) | B |
| 2 | R (CMS content prep) | C, D |
| 3 | T (CMS publish runbook) | E |
| 4 | X4 (guarded activation) | F |
| 5 | X5b (CMS copy swap) | D, E |
| 6 | X5c (launch-readiness audit) | H prep |
| 7 | X5d (live E2E) | K prep |
| 8 | X5e (catalog policy) | G |
| 9 | X6 (content sign-off) | H |
| 10 | X6.1 (copyVersion v1) | I |
| 11 | X7 (launch flip) | J |
| 12 | X7 verify + deploy-fix | K |
| — | X8 (artifacts) | L — **deferred** |

---

## 5. Stage playbook (inputs → outputs → tests → evidence)

### A. Premise intake

| | |
| --- | --- |
| **Inputs** | Problem point, archetype, intended audience, outcome count, artifact intent |
| **Outputs** | Planned concept in creation plan OR wizard handoff; slug candidate |
| **Tests** | N/A (planning) |
| **Evidence** | Link to `/admin/assessments/create` export or creation-plan entry |
| **Approval** | Product/founder acknowledges scope |

### B. Engineering scaffold

| | |
| --- | --- |
| **Inputs** | Approved slug, `assessmentType`, outcome level IDs |
| **Outputs** | `ASSESSMENT_REGISTRY` entry (`draft` or `active` per plan); `OPERATIONS_CONTRACTS` row; scoring adapter in `ADAPTER_REGISTRY`; outcome mapper in `OUTCOME_MAPPERS`; forced-preview builder + admin routes |
| **Tests** | `assessmentRegistry.test.ts`; adapter/mapper unit tests; `operationsContract.test.ts` |
| **Evidence** | PR link; admin hub URL `/admin/assessments/<slug>` |
| **Approval** | Engineering merge |

**Hard rule:** Both adapter **and** mapper must exist before runtime activation.
Neither inherits from Gut Check.

### C. Question set + scoring

| | |
| --- | --- |
| **Inputs** | Authoring spec JSON under `content/assessments/<slug>/` |
| **Outputs** | Validated question set; `avatars` array matching outcome IDs |
| **Tests** | Content spec test file; `npm test -- <slug>ContentSpec`; validator in authoring UI |
| **Evidence** | Repo JSON path; CMS revision ID after publish |
| **Approval** | Editor sign-off row in content matrix |

### D. Result packs

| | |
| --- | --- |
| **Inputs** | Flow v2 pack JSON per level; CTA/video/artifact posture documented |
| **Outputs** | `validateResultsPack` PASS for every level; placeholder scan clean or explicitly waived |
| **Tests** | Content spec test; forced preview per outcome |
| **Evidence** | Pack IDs + revision IDs in matrix; forced-preview URLs |
| **Approval** | Per-pack matrix rows |

### E. CMS publish

| | |
| --- | --- |
| **Inputs** | Admin access; staging or production target per runbook |
| **Outputs** | Published question-set pointer; published pack pointers |
| **Tests** | Resolve API returns `source: cms`; dry-run QA operator PASS |
| **Evidence** | Runbook §6 evidence table; QA markdown report in `.reports/assessments/` |
| **Approval** | Admin publish + engineering review |

Follow assessment-specific runbook pattern in
[`baseline-readiness-cms-publish-runbook.md`](./baseline-readiness-cms-publish-runbook.md).

### F. Guarded direct-link QA

| | |
| --- | --- |
| **Inputs** | CMS published; registry `status: 'active'` |
| **Outputs** | `/assessments/<slug>` 200; runner completes; results resolve; **still noindex** |
| **Tests** | Internal fixture runner; forced preview; staging QA `--skip-public-safety` off |
| **Evidence** | Screenshot or report; submission IDs for later live E2E |
| **Approval** | Engineering GO for guarded ops |

**Do not** set `catalogVisible: true` or remove noindex in this stage.

### G. Catalog policy (pre-launch hide)

| | |
| --- | --- |
| **Inputs** | Guarded activation complete |
| **Outputs** | `catalogVisible: false` while `status: 'active'` |
| **Tests** | `/assessments` lists sibling assessments only; direct link still works |
| **Evidence** | `listCatalogAssessments()` unit test; HTTP check on catalog page |
| **Approval** | Engineering (policy default for new assessments) |

### H. Content sign-off

| | |
| --- | --- |
| **Inputs** | CMS rev IDs; live E2E draft PASS; audit findings |
| **Outputs** | Completed content matrix with founder checkboxes |
| **Tests** | Live E2E; placeholder scan; Method CTA HTTP 200 |
| **Evidence** | Matrix doc with approver + date + packet UUID |
| **Approval** | Founder/editor **explicit GO** — docs only, no launch flip |

Required sign-off domains (each independent row):

1. Scoring validity  
2. `copyVersion` string  
3. Question set  
4. Result packs (all levels)  
5. Video/media posture  
6. Artifact posture (disabled vs X8)  
7. Acknowledgment that launch flip is a **separate packet**

### I. copyVersion v1 republish

| | |
| --- | --- |
| **Inputs** | X6 authorization to bump version; published content unchanged except `copyVersion` |
| **Outputs** | New CMS revision per pack; repo spec aligned to `v1` |
| **Tests** | Resolve API `copyVersion: v1`; live E2E PASS |
| **Evidence** | Republish JSON report in `.reports/assessments/` |
| **Approval** | Engineering execute; founder authorized in X6 |

**Mechanical only** — no SEO/catalog/registry changes.

### J. Launch flip

| | |
| --- | --- |
| **Inputs** | X6/X6.1 closed; founder launch GO recorded |
| **Outputs** | Remove slug-specific `noindex` override; `catalogVisible: true`; sitemap entries |
| **Tests** | Unit tests for registry, sitemap, internal posture tests |
| **Evidence** | PR with exact file list (Baseline X7: `resolveAssessmentExperience.ts`, `assessmentRegistry.ts`, `sitemap.xml.tsx`) |
| **Approval** | Founder launch GO + engineering merge |

**Unchanged in J:** artifacts, scoring, question set copy, Gut Check, unapproved
nav/homepage links.

### K. Post-deploy verification

| | |
| --- | --- |
| **Inputs** | Production deploy READY; commit SHA on Vercel deployment |
| **Outputs** | PASS live E2E report; curl evidence |
| **Tests** | See §8 checklists |
| **Evidence** | `.reports/assessments/<slug>-live-e2e-<timestamp>.md`; deploy ID |
| **Approval** | Recommend production closeout GO or NO-GO |

**Critical:** Code-complete ≠ production live. Always verify HTTP on
`https://myfinediet.com` after deploy.

### L. Optional artifacts (X8)

| | |
| --- | --- |
| **Inputs** | Separate founder GO; routing config; n8n/webhook targets |
| **Outputs** | `isOutputArtifactEnabled` true per artifact; contract updated |
| **Tests** | Per-artifact integration tests; live E2E artifact rows |
| **Evidence** | Outbox metrics; test sends |
| **Approval** | **Never** bundled with launch flip |

### M. Closeout

Update assessment matrix, runbook §12, and this SOP if process gaps found.
Record production deploy ID, commit SHA, live E2E path, and closeout recommendation.

---

## 6. Future assessment packet template

Copy into a new doc: `docs/assessments/<slug>-deployment-packet.md`

```markdown
# <Assessment Title> — Deployment Packet

| Field | Value |
| --- | --- |
| Assessment slug | `<slug>` |
| assessmentType | `<assessmentType>` |
| Packet UUID | `<uuid>` |
| Stage | `<A–M from SOP §3>` |
| Branch | `fd-assessments/<slug>-<stage>-<id>` |
| Founder GO | _pending / UUID_ |

## Outcomes

| levelId | Label | Pack CMS ID | Published rev | copyVersion |
| --- | --- | --- | --- | --- |
| `<level-a>` | | | | |
| `<level-b>` | | | | |

## Scoring

| Field | Value |
| --- | --- |
| Adapter ID | `<adapter-id>` |
| Threshold model | _e.g. 0–15 equal weight_ |
| Outcome mapper ID | `<mapper-id>` |
| Provisional? | ☐ Yes ☐ Final |

## CMS revisions

| Artifact | Version | Revision ID | Published? |
| --- | --- | --- | --- |
| Question set | `1` | | ☐ |
| Result pack `<level-a>` | `v1` | | ☐ |

## Preview URLs

| Outcome | Forced preview |
| --- | --- |
| `<level-a>` | `/admin/assessments/<slug>/preview?forceOutcome=<level-a>` |

## Live submission IDs (production E2E)

| Outcome | submission_id |
| --- | --- |
| `<level-a>` | |

## Launch flags (independent gates)

| Gate | Target | Current | Flip in this packet? |
| --- | --- | --- | --- |
| Registry status | active | | ☐ |
| catalogVisible | true/false | | ☐ |
| noindex override | none / slug override | | ☐ |
| Sitemap | included | | ☐ |
| Artifacts | disabled | | ☐ |

## Artifact choices (X8 only)

| Artifact | Enable? | Notes |
| --- | --- | --- |
| Email | ☐ | |
| PDF | ☐ | |
| Webhook | ☐ | |
| Claim | ☐ | |
| Account-save | ☐ | |
| Share | ☐ | |

## Tests run

- [ ] `npm test -- <slug>…`
- [ ] `npm run assessments:<slug>:qa`
- [ ] `npm run assessments:<slug>:live-e2e -- --base-url=https://myfinediet.com`

## Evidence paths

- QA report:
- Live E2E report:
- Vercel deploy ID:

## Recommendation

☐ GO  ☐ NO-GO — blockers:
```

---

## 7. GO / NO-GO launch gate table

Use at **K. Post-deploy verification** and before recording production closeout.

| # | Check | GO criterion | NO-GO if |
| --- | --- | --- | --- |
| 1 | Deploy live | Vercel production READY; commit SHA matches merge | Old buildId/dpl; pre-flip behavior |
| 2 | Cover SEO | `/assessments/<slug>` → `index,follow` | `noindex` present |
| 3 | Results SEO | Public results routes indexable (when applicable) | `noindex` on results |
| 4 | Sitemap catalog | `/assessments` in sitemap | Missing |
| 5 | Sitemap assessment | `/assessments/<slug>` in sitemap | Missing |
| 6 | Catalog page | Lists new assessment + expected siblings only | Missing or extra entries |
| 7 | Live E2E | All outcomes PASS | Any outcome FAIL |
| 8 | Artifacts | Disabled unless X8 approved | Unexpected enabled artifact |
| 9 | Gut Check regression | Smoke PASS in live E2E | FAIL |
| 10 | Scoring unchanged | No adapter diff since sign-off | Unauthorized scoring change |
| 11 | CMS copyVersion | Matches signed launch string (e.g. `v1`) | Wrong version |
| 12 | Placeholders | No `(placeholder)`, `/method`, test YouTube IDs | Found in resolve/E2E |
| 13 | Marketing scope | Only approved surfaces (e.g. catalog-only) | Unapproved nav/home links |

**Production closeout GO:** all rows 1–13 PASS (row 8 PASS = artifacts remain disabled when X8 deferred).

---

## 8. Reusable checklists

### 8.1 Content matrix (stage H)

- [ ] Scoring adapter/thresholds documented and approved  
- [ ] `copyVersion` launch string named (not `*-test-candidate` / `*-internal-draft`)  
- [ ] Question set approved for public path  
- [ ] Every outcome pack approved (label, summary, CTAs, body)  
- [ ] Video strategy explicit (no-video **or** approved URLs)  
- [ ] Artifact posture explicit (disabled at launch **or** X8 scheduled)  
- [ ] Method CTA URLs return **200** on production  
- [ ] No approved string contains `(placeholder)`  
- [ ] Founder/editor name + date on each row  
- [ ] Launch flip acknowledged as **separate packet**

Template: [`baseline-readiness-content-approval-matrix.md`](./baseline-readiness-content-approval-matrix.md)

### 8.2 Scoring validity

- [ ] Adapter registered in `ADAPTER_REGISTRY`  
- [ ] Unit tests cover band boundaries and edge answers  
- [ ] Outcome mapper registered; no Gut Check level IDs leaked  
- [ ] `dispatchScoring` fail-closed for unknown types verified  
- [ ] Provisional vs final clinical accept recorded in matrix  

### 8.3 Question set approval

- [ ] `avatars` / outcome IDs match mapper  
- [ ] Option values valid per schema (e.g. 0–3 once each)  
- [ ] Authoring UI validator PASS  
- [ ] Repo spec test PASS  
- [ ] CMS published pointer set  

### 8.4 No-video / media posture

- [ ] Strategy recorded in matrix (no-video vs per-level video)  
- [ ] No test fixture YouTube IDs in published packs  
- [ ] Live E2E: `videoAssetUrl` null / `videoUrl` null  
- [ ] SSR HTML free of placeholder video refs  

### 8.5 Artifact posture

- [ ] `channels.email.enabled: false` in CMS packs (if disabled)  
- [ ] `channels.pdf.enabled: false`  
- [ ] `isOutputArtifactEnabled('<type>', …)` false for each artifact  
- [ ] Live E2E artifact rows PASS as disabled  
- [ ] X8 packet ID recorded if enablement planned  

### 8.6 Gut Check / sibling regression

- [ ] `listCatalogAssessments()` still includes Gut Check when expected  
- [ ] Gut Check cover `index,follow`  
- [ ] Gut Check pack resolve HTTP 200  
- [ ] No Baseline/Gut Check cross-contamination in scoring tests  
- [ ] Live E2E Gut Check smoke section PASS  

### 8.7 Live E2E (production)

```bash
npm run assessments:<slug>:live-e2e -- --base-url=https://myfinediet.com
```

Per outcome verify chain:

- [ ] Submission API 200 + correct `primary_avatar`  
- [ ] Pack resolve 200 + expected label + Method CTA  
- [ ] Resolver output matches pack (headlines, no video)  
- [ ] Public results route 200 + indexable  
- [ ] Method destination HTTP 200  
- [ ] Artifacts disabled  

Report path: `.reports/assessments/<slug>-live-e2e-<timestamp>.md`

### 8.8 Placeholder scans

Scan resolve API + SSR HTML + repo JSON for:

- [ ] `(placeholder)` in user-facing strings  
- [ ] `/method` (404 on production)  
- [ ] Known test YouTube IDs (e.g. repo fixture IDs)  
- [ ] `v1-internal-draft` / `v1-test-candidate` after launch authorized  

### 8.9 Sitemap / index checks (curl)

```bash
curl -sS https://myfinediet.com/assessments/<slug> | rg 'robots'
curl -sS https://myfinediet.com/sitemap.xml | rg assessments
curl -sS https://myfinediet.com/assessments | rg '<slug>|Gut Check'
```

- [ ] `index,follow` on cover  
- [ ] `/assessments` and `/assessments/<slug>` in sitemap  
- [ ] Catalog lists expected assessments only  

### 8.10 Production closeout

- [ ] Commit SHA + Vercel deploy ID recorded  
- [ ] Live E2E PASS attached  
- [ ] Matrix/runbook closeout sections updated  
- [ ] Recommendation: **GO** or **NO-GO** with blockers  
- [ ] X8 status noted (deferred / in progress / N/A)  

---

## 9. Anti-loop guidance

Agents and operators often re-run work that **cannot** fix the observed failure.
Use this section to stop infinite loops.

### Code-complete ≠ production live

If production still shows `noindex`, missing sitemap entries, or catalog omitting
the assessment **but local tests PASS**, the blocker is almost always **deploy**,
not content. **Fix:** commit → merge → push → wait for Vercel READY → re-verify
HTTP. Do not re-run CMS republish or content sign-off.

### Do not re-sign content to fix SEO

Removing `noindex` and setting `catalogVisible: true` are **engineering launch-flip**
changes (stage J). Re-auditing copy in stage H does not fix indexing.

### Do not enable artifacts to “finish launch”

Artifact enablement is stage L (X8). A launch-flip packet (J) must leave artifacts
disabled unless explicitly approved.

### CMS publish ≠ marketing launch

Publishing question sets and packs (stage E) does not approve catalog, sitemap, or
indexing. Do not flip registry/catalog/SEO gates as a side effect of CMS apply scripts.

### When live E2E fails only on index/sitemap

| Symptom | Likely cause | Smallest fix |
| --- | --- | --- |
| `noindex` on production | Pre-J deploy | Ship J; verify deploy ID |
| Sitemap missing route | Pre-J deploy or `catalogVisible: false` | Ship J; confirm registry |
| Catalog missing card | `catalogVisible: false` | Set true in J |
| Content checks PASS, index FAIL | Deploy drift | Deploy-fix packet; no CMS change |

### When forced preview PASS but live results FAIL

Check **published** pointers vs preview pointers, `copyVersion`, and production
submission IDs. Do not re-run forced preview — run resolve API + live E2E.

### Escalate instead of improvising

Stop and file a follow-up if a step requires:

- Undocumented Supabase writes  
- Registry/scoring changes outside the current packet scope  
- Enabling artifacts without X8 GO  
- Adding nav/homepage links without marketing approval  

---

## 10. Agent handoff requirements

When an agent completes **any** stage, the handoff must include enough context
for the next agent to continue **without re-reading the full transcript**.

### Required handoff fields

| Field | Example |
| --- | --- |
| Assessment slug | `baseline-readiness` |
| Stage completed | `J — Launch flip` |
| Packet UUID | `cc93978a-…` |
| Branch / PR | `fd-assessments/…` |
| Commit SHA | `1173341…` |
| Production deploy ID | `dpl_Fhj4dEx1pRZBdHi5vD2WE8xCqrjU` |
| Recommendation | GO / NO-GO |
| Blockers | _none or explicit list_ |
| Evidence paths | `.reports/assessments/…` |
| Next stage | `K — Post-deploy verification` |
| Gates **not** flipped | e.g. artifacts deferred X8 |

### Handoff rules

1. **Never mark production GO from local tests alone** — include deploy ID or label
   “code-complete; deploy pending.”  
2. **Record founder approval UUIDs** when content or launch GO is claimed.  
3. **List files changed** when flipping gates (SEO, registry, sitemap).  
4. **Preserve sibling assessments** — note Gut Check regression status.  
5. **Do not commit secrets** — reference env var names only.  
6. **Docs-only packets** must state “no runtime change” explicitly.  
7. **Separate NO-GO root cause** — deploy vs content vs scoring vs CMS.  

### Suggested closeout message template

```
Assessment: <slug>
Stage: <letter + name>
Packet: <uuid>
Commit: <sha> | Deploy: <dpl_…> | Status: READY
Live E2E: <path> — PASS/FAIL
Gates: runtime=… catalog=… seo=… sitemap=… artifacts=…
Regression: Gut Check PASS/FAIL
Recommendation: <GO/NO-GO>
Next: <stage or X8>
```

---

## 11. Baseline reference commands (proof path)

Replace `baseline-readiness` with `<slug>` when a deployment config exists in
[`configRegistry.ts`](../../lib/assessments/deployment/configRegistry.ts).

| Command | Stage |
| --- | --- |
| `npm run assessments:baseline-readiness:qa -- --dry-run` | E — dry-run validation (Baseline wrapper) |
| `npm run assessments:staging-qa -- --slug=baseline-readiness --dry-run` | E — generic staging QA |
| `npm run assessments:live-e2e -- --slug=baseline-readiness` | K — generic live E2E |
| `npm run assessments:baseline-readiness:live-e2e` | K — Baseline wrapper (equivalent) |
| `npm run assessments:copyversion-republish -- --slug=baseline-readiness --dry-run` | I — generic republish |
| `npm test -- deploymentOperators` | X10 operator unit tests |

**Operator appendix:** [`assessment-deployment-operators.md`](./assessment-deployment-operators.md)

**Baseline production closeout (2026-07-09):**

- Commit: `1173341ae927ca862979fd95b8db129b83a41243`  
- Deploy: `dpl_Fhj4dEx1pRZBdHi5vD2WE8xCqrjU`  
- Live E2E: `.reports/assessments/baseline-readiness-live-e2e-2026-07-09T13-27-57-108Z.md`  
- Artifacts: deferred X8  

---

## 12. Future implementation gaps

These are **not** blockers for using this SOP; they are engineering follow-ups
to reduce Baseline-specific duplication for assessment #3+.

| Gap | Baseline today | Desired reusable shape |
| --- | --- | --- |
| Live E2E script | Generic + Baseline wrapper (**X10**) | `npm run assessments:live-e2e -- --slug=` |
| Staging QA operator | Baseline-only; shared source validation (**X10**) | Generic `--slug=` staging QA |
| copyVersion republish | Generic + Baseline wrapper (**X10**) | `npm run assessments:copyversion-republish -- --slug=` |
| Content matrix doc | Template in `docs/assessments/templates/` (**X10**) | Per-assessment copied doc |
| CMS publish runbook | Template in `docs/assessments/templates/` (**X10**) | Per-assessment copied doc |
| Forced preview | Per-assessment builder + admin route | Scaffold CLI or checklist in Packet B |
| Video optional in validator | Baseline no-video required PR #136 waiver path | First-class optional `videoAssetUrl` in validator + Flow v2 detection |
| Generic deployment packet | §6 template (manual) | Optional script to scaffold `docs/assessments/<slug>-deployment-packet.md` |
| Admin hub copy | Baseline hardcoded status strings | Registry-driven launch posture display |

**Engineering reference:** [`assessment-deployment-operators.md`](./assessment-deployment-operators.md) (Packet X10).

---

## 13. Quick reference — files that flip launch gates

| Gate | Typical files |
| --- | --- |
| Runtime activation | `lib/assessments/assessmentRegistry.ts` (`status`) |
| Catalog listing | `lib/assessments/assessmentRegistry.ts` (`catalogVisible`) |
| SEO indexability | `lib/assessments/resolveAssessmentExperience.ts` (remove slug `noindex` override) |
| Sitemap | `pages/sitemap.xml.tsx` (`listCatalogAssessments`) |
| Artifacts | `lib/assessments/operationsContract.ts` + CMS pack channels |
| Scoring | `lib/assessments/scoring/scoringDispatch.ts` + adapter module |
| Outcomes | `lib/assessments/outcomes/outcomeMapping.ts` + mapper module |

**Do not** conflate changes across gates in a single PR unless the founder
explicitly approved a combined launch packet.

# Next Assessment Readiness (Packet X12)

This doc captures the **readiness path for Assessment #3+** after Baseline
Readiness went live. It is the gate before any new assessment slug is
registered, scored, or launched.

**Finding (2026-07-10):** No canonical next-assessment slug is confirmed in the
repo or Second Brain. Factory problem-point ids (`program-fit`,
`protein-sufficiency`, `sugar-stability`, etc.) are **planning vocabulary
only** — not approved slugs. Do not register or scaffold a slug until product
/strategy confirms one.

## What was searched

| Source | Result |
| --- | --- |
| `ASSESSMENT_REGISTRY` | Only `gut-check` and `baseline-readiness` |
| `content/assessments/` | Only `gut-check/` and `baseline-readiness/` |
| Second Brain substrate | No task/decision/doc naming Assessment #3 slug |
| Repo grep (`assessment #3`, `next assessment`, `program-match`) | Docs reference generic patterns only; no slug |
| [`assessment-factory.md`](./assessment-factory.md) problem-point table | Planned problem points, not slugs |

## Readiness inventory helper

Use [`lib/assessments/nextAssessmentReadiness.ts`](../../lib/assessments/nextAssessmentReadiness.ts)
after a slug + `assessmentType` pair is confirmed:

```typescript
import { inventoryNextAssessmentReadiness } from '@/lib/assessments/nextAssessmentReadiness';

const report = inventoryNextAssessmentReadiness('<slug>', '<assessmentType>');
// report.draftActivationReady — registry + adapter + mapper + contract
// report.operatorReady — above + deployment config + staging QA + repo content
// report.surfaces — per-surface present / missing / optional-missing
```

Run tests: `npm test -- nextAssessmentReadiness`

## Decisions required before implementation

Product/strategy must confirm **all** of the following before engineering
registers Assessment #3:

1. **Canonical slug + assessmentType** — unique, URL-safe, stable (usually equal).
2. **Problem point + archetype + scoring template** — pick from factory metadata
   ([`assessment-factory.md`](./assessment-factory.md)); if archetype is not
   `axis-profile`, engineering is required first.
3. **Outcome shape** — level bands, persona, flags, or recommendation-set
   (see [`outcome-mapping.md`](./outcome-mapping.md)).
4. **Result levels / outcome ids** — exact ids for results packs and forced preview.
5. **Scoring model** — adapter id, option value range, provisional vs final sign-off.
6. **Launch posture** — direct-link draft vs catalog-visible public launch; SEO/sitemap intent.
7. **Artifact scope** — email/PDF/claim/account-save enabled or deferred (X8 still deferred globally for Baseline).
8. **CMS content owner** — who authors questions + result packs; approval matrix sign-off path.

## File touchpoint matrix (Assessment #3+)

Follow Baseline Readiness as the proof path. Replace `<slug>` / `<assessmentType>` only after decisions above are locked.

| Surface | File(s) | Required for draft activation | Required for operators / launch |
| --- | --- | --- | --- |
| Registry | [`lib/assessments/assessmentRegistry.ts`](../../lib/assessments/assessmentRegistry.ts) | Yes (`status: 'draft'` first) | Yes (`active` + `catalogVisible` when approved) |
| Scoring adapter | [`lib/assessments/scoring/<slug>Adapter.ts`](../../lib/assessments/scoring/) + register in [`scoringDispatch.ts`](../../lib/assessments/scoring/scoringDispatch.ts) | Yes | Yes |
| Outcome mapper | [`lib/assessments/outcomes/`](../../lib/assessments/outcomes/) + register in [`outcomeMapping.ts`](../../lib/assessments/outcomes/outcomeMapping.ts) | Yes | Yes |
| Operations contract | [`lib/assessments/operationsContract.ts`](../../lib/assessments/operationsContract.ts) | Yes | Yes |
| Cover config | [`lib/assessments/coverConfig.ts`](../../lib/assessments/coverConfig.ts) | Optional (generic fallback exists) | Recommended before marketing launch |
| Forced preview | `lib/assessments/results/forcedPreview<Slug>.ts` + `pages/admin/assessments/<slug>/preview.tsx` | Recommended for QA | Yes before public launch |
| Internal QA runner | `pages/admin/assessments/<slug>/start.tsx` (if needed) | Optional | As needed |
| Repo content specs | `content/assessments/<slug>/questions_v1.json`, `results_v1-internal.json` | Before CMS entry | Yes |
| CMS docs | Copy from [`docs/assessments/templates/`](./templates/) | Before CMS publish | Yes |
| Deployment config | `lib/assessments/deployment/configs/<slug>DeploymentConfig.ts` + [`configRegistry.ts`](../../lib/assessments/deployment/configRegistry.ts) | No | Yes for staging QA / live E2E |
| Staging QA runner | Register slug in [`stagingQaRunner.ts`](../../lib/assessments/deployment/stagingQaRunner.ts) | No | Yes for automated staging QA |
| npm scripts | `package.json` wrappers (optional) | No | Recommended |
| Tests | Registry, adapter, mapper, internal, deployment operator tests | Yes | Yes |

## Recommended packet sequence (after slug confirmed)

1. **X13 (proposed)** — Register draft registry entry + adapter + mapper + contract (fail-closed, non-public, `catalogVisible: false`).
2. **Content packet** — Repo JSON specs + CMS question set + result packs (manual CMS; no repo writes to Supabase).
3. **Forced preview + internal QA** — Admin routes scoped to new `assessmentType`.
4. **Deployment config + staging QA** — Extend generic operators ([`assessment-deployment-operators.md`](./assessment-deployment-operators.md)).
5. **Launch gate packet** — Content approval matrix, CMS publish runbook, guarded → public promotion (mirror X5–X7 Baseline path).

## Current live inventory (main @ X11 merge)

| Slug | draftActivationReady | operatorReady | Notes |
| --- | --- | --- | --- |
| `gut-check` | Yes | No | No deployment config (not needed for legacy path) |
| `baseline-readiness` | Yes | Yes | Full operator stack; artifacts still disabled |

## Fail-closed guarantees (unchanged)

Unregistered `assessmentType` values:

- `dispatchScoring` → `unknown-assessment-type` (blocks submission)
- `mapAssessmentOutcome` → `unknown-assessment-type`
- `requireDeploymentConfig` → throws
- `runAssessmentStagingQa` → throws for unregistered slug

No assessment silently inherits Gut Check scoring or level mapping.

## Deferred (not X12 scope)

| Item | Status |
| --- | --- |
| X8 artifact enablement | Deferred — Baseline artifacts still disabled |
| Generic staging QA CMS apply core | Baseline runner only; shared diagnostics only |
| Doc generator CLI | Manual template copy |
| Registry-driven admin hub posture | Baseline strings in apply paths |
| Confirmed Assessment #3 slug | **Blocked on product/strategy decision** |

## Related docs

- [Adding a new assessment](./adding-a-new-assessment.md)
- [Assessment deployment operators](./assessment-deployment-operators.md)
- [Assessment deployment SOP](./assessment-deployment-sop.md)
- [Assessment factory](./assessment-factory.md)

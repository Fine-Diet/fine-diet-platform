# Assessment Deployment Operators — Engineering Appendix

Packet **X10** · `521af926-db2e-45bc-b56d-0d188006ca3b`

Operator tooling reference for [`assessment-deployment-sop.md`](./assessment-deployment-sop.md).
Human-facing process docs may also live in Second Brain / Google Drive; this appendix
is the **repo source of truth for commands and config**.

---

## 1. Architecture

```
lib/assessments/deployment/
  types.ts                    — config + report types
  configRegistry.ts           — slug → config lookup
  configs/
    baselineReadinessDeploymentConfig.ts
  sourceValidation.ts         — repo JSON validation
  launchGateChecks.ts         — independent X9 gates (in-repo + HTTP)
  placeholderScan.ts          — banned placeholder patterns
  siblingRegression.ts        — Gut Check (and configured siblings)
  liveE2eOperator.ts          — production results E2E core
  runAssessmentLiveE2eCli.ts    — CLI runner shared by wrappers
  copyVersionRepublish.ts     — mechanical CMS copyVersion bump
  runAssessmentCopyVersionRepublishCli.ts
  applyModeGuard.ts           — staging apply safety (shared)

scripts/assessments/
  assessment-live-e2e.ts              — generic entry (--slug=)
  assessment-copyversion-republish.ts — generic entry (--slug=)
  baseline-readiness-live-e2e.ts      — Baseline wrapper
  baseline-readiness-x6-1-republish.ts
  baseline-readiness-staging-qa.ts    — Baseline-only (not yet generic)
```

**Pattern:** Add `configs/<slug>DeploymentConfig.ts`, register in `configRegistry.ts`,
keep slug-specific npm scripts as thin wrappers until the generic path is proven.

---

## 2. Commands

| Task | Baseline wrapper (stable) | Generic (assessment #3+) |
| --- | --- | --- |
| Live E2E | `npm run assessments:baseline-readiness:live-e2e -- --base-url=https://myfinediet.com` | `npm run assessments:live-e2e -- --slug=baseline-readiness --base-url=…` |
| copyVersion republish | `npm run assessments:baseline-readiness:x6-1-republish -- --dry-run` | `npm run assessments:copyversion-republish -- --slug=baseline-readiness --dry-run` |
| Staging QA | `npm run assessments:baseline-readiness:qa` | _Not yet generic — see gaps_ |

Reports write to `.reports/assessments/` (gitignored).

---

## 3. Config shape (`AssessmentDeploymentConfig`)

Register per assessment in `lib/assessments/deployment/configs/`.

| Section | Purpose |
| --- | --- |
| `slug` / `assessmentType` | Registry identity |
| `contentPaths` | Repo JSON for source validation |
| `questionSet` / `results` | Expected IDs, versions, avatars |
| `liveE2e.outcomes` | Per-level labels, CTAs, production `submission_id`s |
| `copyVersionRepublish` | Pack UUIDs + target `copyVersion` (optional) |
| `launchGates` | Artifact keys + gate expectations |
| `siblingRegression` | Gut Check smoke (default sibling) |
| `placeholderScan.bannedSubstrings` | Placeholder scan patterns |
| `stagingQa` | Env var names for admin cookie / Vercel bypass |

**Launch gates honored in operators:**

| Gate | Operator support |
| --- | --- |
| Runtime | `buildInRepoLaunchGateChecks` — registry `active` |
| CMS | `validateAssessmentSource` — repo + validator |
| Catalog | registry `catalogVisible` + HTTP `/assessments` |
| SEO | `buildSeoIndexCheckForRoute` — noindex vs index |
| Sitemap | `buildHttpLaunchGateChecks` / sibling sitemap check |
| Artifacts | `isOutputArtifactEnabled` per configured keys |
| Marketing surfaces | **Manual** — not automated (nav/homepage) |

---

## 4. Adding assessment #3

1. Copy templates from `docs/assessments/templates/`
2. Add `configs/<slug>DeploymentConfig.ts` (use Baseline config as reference)
3. Register slug in `configRegistry.ts`
4. Add npm wrapper scripts (optional) pointing at generic CLIs
5. Extend `lib/assessments/deployment/__tests__/deploymentOperators.test.ts`
6. Run live E2E after production submissions exist

**Do not** copy Baseline pack UUIDs or submission IDs — fill from CMS evidence.

---

## 5. Doc templates

| Template | Path |
| --- | --- |
| Content approval matrix | `docs/assessments/templates/content-approval-matrix.template.md` |
| CMS publish runbook | `docs/assessments/templates/cms-publish-runbook.template.md` |

Replace `{{SLUG}}`, `{{ASSESSMENT_TYPE}}`, `{{LEVEL_*}}`, etc. before use.

---

## 6. Implementation gaps (post-X10)

| Gap | Status |
| --- | --- |
| Generic staging QA operator | **Baseline-only** — `stagingQaOperator.ts` (~1.8k lines); source validation now shared |
| Generic staging QA CLI `--slug=` | Not implemented |
| Doc generator CLI | Manual template copy only |
| Gut Check deployment config | Not needed unless regression config changes |
| Optional video in pack validator | Unchanged — assessment-specific engineering |
| Registry-driven admin hub posture | Hardcoded Baseline strings remain |

---

## 7. Tests

```bash
npm test -- deploymentOperators
npm test -- baselineReadinessStagingQaOperator
npm test -- baselineReadinessContentSpec
```

---

## 8. Guardrails

Operators **never**:

- Change registry, SEO, sitemap, or `catalogVisible` (unless a future dedicated packet does)
- Enable artifacts
- Write to production CMS in apply mode (apply guard refuses production hosts/envs)
- Commit secrets (use env vars documented in Baseline config `stagingQa` section)

Sibling regression defaults to **Gut Check** for every new assessment config until
explicitly overridden.

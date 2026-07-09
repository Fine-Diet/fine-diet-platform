# {{ASSESSMENT_TITLE}} — CMS Publish Runbook

Copy this template to `docs/assessments/{{SLUG}}-cms-publish-runbook.md` at stage
**E — CMS publish** (see [`assessment-deployment-sop.md`](../assessment-deployment-sop.md)).

Reference implementation: [`baseline-readiness-cms-publish-runbook.md`](../baseline-readiness-cms-publish-runbook.md)

---

## 0. Scope and hard limits

**Covers:** question set + result pack CMS publish, forced-preview QA, evidence capture.

**Does not:** approve marketing launch, change registry/SEO/catalog, enable artifacts.

---

## 1. Identities at a glance

| Artifact | assessment_type | Version | level_id | Source path |
| --- | --- | --- | --- | --- |
| Question set | `{{ASSESSMENT_TYPE}}` | `{{QS_CMS_VERSION}}` | n/a | `content/assessments/{{SLUG}}/questions_v1.json` |
| Result pack | `{{ASSESSMENT_TYPE}}` | `{{RESULTS_VERSION}}` | `{{LEVEL_A}}` | `content/assessments/{{SLUG}}/results_v1.json` |

Expected avatars / outcome IDs: {{OUTCOME_IDS}}

---

## 2. Preflight

- [ ] Scoring adapter + outcome mapper registered (stage B)
- [ ] Source JSON validates (`npm test -- {{SLUG}}ContentSpec` or deployment source validation)
- [ ] Admin/editor access to publish
- [ ] Artifacts disabled in packs and operations contract
- [ ] Guarded activation posture documented (runtime vs catalog vs SEO)

---

## 3. Publish steps

1. Author question set at `/admin/question-sets/author`
2. Publish question-set revision (admin)
3. Create result pack identities (API if no UI)
4. Save + publish result pack revisions per level
5. Run forced preview for each outcome

Forced preview URL pattern:

```
/admin/assessments/{{SLUG}}/preview?forceOutcome={{LEVEL_A}}
```

---

## 4. QA operators

```bash
# Baseline-style wrapper (until generic staging QA ships):
npm run assessments:{{SLUG}}:qa

# Generic live E2E (after production submissions exist):
npm run assessments:live-e2e -- --slug={{SLUG}} --base-url=https://myfinediet.com
```

Reports: `.reports/assessments/{{SLUG}}-*.md`

---

## 5. Evidence table

| Step | Operator | Rev ID | Timestamp | Notes |
| --- | --- | --- | --- | --- |
| Question set publish | | | | |
| Pack {{LEVEL_A}} | | | | |
| Pack {{LEVEL_B}} | | | | |

---

## 12. Marketing launch checklist

Do **not** complete until content matrix (stage H) is GO.

- [ ] Content sign-off complete
- [ ] copyVersion republish (if required)
- [ ] Launch flip packet (SEO + catalog + sitemap) — separate from CMS publish
- [ ] Post-deploy live E2E PASS
- [ ] Gut Check regression PASS

See [`assessment-deployment-operators.md`](../assessment-deployment-operators.md).

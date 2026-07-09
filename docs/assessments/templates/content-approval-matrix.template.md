# {{ASSESSMENT_TITLE}} — Content Approval Matrix

Copy this template to `docs/assessments/{{SLUG}}-content-approval-matrix.md` when
starting stage **H — Content sign-off** (see
[`assessment-deployment-sop.md`](./assessment-deployment-sop.md)).

| Field | Value |
| --- | --- |
| Assessment slug | `{{SLUG}}` |
| assessmentType | `{{ASSESSMENT_TYPE}}` |
| Packet UUID | _pending_ |
| CMS publish runbook | [`{{SLUG}}-cms-publish-runbook.md`](./{{SLUG}}-cms-publish-runbook.md) |
| Question set spec | `content/assessments/{{SLUG}}/questions_v1.json` |
| Result packs spec | `content/assessments/{{SLUG}}/results_v1.json` |

---

## Launch gate summary (independent decisions)

| Gate | Decision | Approver | Date |
| --- | --- | --- | --- |
| Runtime activation | ☐ GO ☐ NO-GO | | |
| CMS published | ☐ GO ☐ NO-GO | | |
| Scoring validity | ☐ GO ☐ NO-GO | | |
| `copyVersion` | ☐ GO ☐ NO-GO | | |
| Question set | ☐ GO ☐ NO-GO | | |
| Result packs (all levels) | ☐ GO ☐ NO-GO | | |
| Video/media posture | ☐ GO ☐ NO-GO | | |
| Artifacts | ☐ Disabled ☐ X8 enable | | |
| Launch flip (SEO/catalog/sitemap) | ☐ Separate packet | | |

Reference matrix: [`baseline-readiness-content-approval-matrix.md`](./baseline-readiness-content-approval-matrix.md)

---

## Per-outcome pack matrix

| Level | Label | CMS pack ID | Published rev | copyVersion | Approved? |
| --- | --- | --- | --- | --- | --- |
| `{{LEVEL_A}}` | | | | | ☐ |
| `{{LEVEL_B}}` | | | | | ☐ |
| `{{LEVEL_C}}` | | | | | ☐ |

---

## Global decisions

| Field | Value | Approved? |
| --- | --- | --- |
| Method CTA URL | | ☐ |
| Video strategy | No-video **or** approved URLs | ☐ |
| Artifact posture | Disabled at launch | ☐ |

---

## Placeholder scan sign-off

- [ ] No `(placeholder)` in approved strings
- [ ] No `/method` (404) in approved CTAs
- [ ] No test YouTube fixture IDs in published packs
- [ ] Live E2E PASS for all outcomes

---

## Closeout

| Stage | Status | Date |
| --- | --- | --- |
| Content sign-off (H) | | |
| copyVersion republish (I) | | |
| Launch flip (J) | | |
| Post-deploy verify (K) | | |
